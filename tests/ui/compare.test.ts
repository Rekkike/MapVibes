import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  byId,
  dragItemToStage,
  editCell,
  flush,
  importExampleWorkbook,
  loadExampleBackground,
  markers,
  mountApp,
  openWorkFile,
  placeExampleMarkers,
  placementItems,
  setRole,
  STAGE,
  textFile,
} from './harness';

type App = Awaited<ReturnType<typeof mountApp>>;

// The build version is the specification version (its status line).
const VERSION = /Status: v([0-9.]+)/.exec(readFileSync(join(process.cwd(), 'docs', 'SPECIFICATION.md'), 'utf8'))![1];

// An exported file with A-01, A-03, A-05 placed (stage points under the
// fitted view, scale 2/3) and A-02, A-04 without markers.
async function exportedFile(): Promise<string> {
  const app = await mountApp({ singleFile: true });
  await placeExampleMarkers([
    [0, 60, 100],
    [2, 400, 300],
    [4, 760, 500],
  ]);
  return app.exportPage(new Date('2024-09-01T08:00:00Z'))!;
}

function groups(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const section of document.querySelectorAll<HTMLElement>('#compare-groups .compare-group')) {
    out[section.dataset.group!] = [...section.querySelectorAll('.compare-entry')].map((li) =>
      [...li.querySelectorAll('.compare-name, .compare-note')].map((n) => n.textContent).join(' / '),
    );
  }
  return out;
}

function headings(): string[] {
  return [...document.querySelectorAll('#compare-groups h3')].map((h) => h.textContent ?? '');
}

function dirty(): boolean {
  return !byId('work-dirty').classList.contains('hidden');
}

async function openExport(page: string, name = 'mapvibes-presentation.html'): Promise<void> {
  openWorkFile(textFile(name, page));
  await flush();
}

describe('re-import and comparison (FR-14)', () => {
  let page: string;
  let app: App;

  beforeEach(async () => {
    page = await exportedFile();
    // The current work: the same workbook, A-01 placed elsewhere, A-02
    // placed (it has no marker in the file), A-03 at the same place, A-05
    // removed, and a row M-01 added by hand.
    app = await mountApp();
    await importExampleWorkbook();
    setRole('ID', 'identifier');
    byId('tab-map').click();
    await loadExampleBackground();
    dragItemToStage(placementItems()[0], STAGE.left + 200, STAGE.top + 200);
    dragItemToStage(placementItems()[1], STAGE.left + 300, STAGE.top + 100);
    dragItemToStage(placementItems()[2], STAGE.left + 400, STAGE.top + 300);
    byId('tab-information').click();
    document.querySelectorAll<HTMLElement>('#row-table-body tr')[4].querySelector<HTMLInputElement>('.row-select')!.click();
    byId('delete-selected').click();
    byId('add-row').click();
    editCell(4, 'ID', 'M-01');
  });

  test('opening an exported file shows the comparison and changes nothing', async () => {
    const before = JSON.stringify(app.captureWorkState());
    const wasDirty = dirty();
    await openExport(page);
    expect(byId('work-status').textContent).toBe('The exported file was opened for comparison. The current work is unchanged.');
    expect(byId('compare-panel').classList.contains('hidden')).toBe(false);
    expect(byId('compare-source').textContent).toBe(
      'File exported 2024-09-01 ' +
        new Date('2024-09-01T08:00:00Z').toTimeString().slice(0, 5) +
        ` by MapVibes v${VERSION}, with 5 items.` +
        ' Items are paired by the identifier column (ID in the file, ID in the current work). The current work is not changed unless you adopt marker positions below.',
    );
    expect(JSON.stringify(app.captureWorkState())).toBe(before);
    expect(dirty()).toBe(wasDirty);
  });

  test('the items are sorted into the comparison outcomes', async () => {
    await openExport(page);
    expect(headings()).toEqual([
      'Paired, with a marker in the file (2)',
      'Paired, without a marker in the file (2)',
      'Only in the file (1)',
      'Only in the current work (1)',
      'Cannot be paired: empty or repeated identifier (0)',
    ]);
    expect(groups()).toEqual({
      'matched-markers': ['1. A-01 / position differs', '3. A-03 / same position'],
      'matched-no-markers': ['2. A-02 / marker in the current work', '4. A-04'],
      'file-only': ['5. A-05'],
      'current-only': ['5. M-01'],
      unpairable: [],
    });
    // Only differing positions can be chosen for adoption.
    expect(document.querySelectorAll('.compare-select')).toHaveLength(1);
  });

  test('adopting is an explicit choice: the chosen positions move, as unsaved changes', async () => {
    await openExport(page);
    const before = markers().map((m) => [m.style.left, m.style.top]);
    expect(byId<HTMLButtonElement>('compare-adopt').disabled).toBe(true);
    const box = document.querySelector<HTMLInputElement>('.compare-select')!;
    expect(box.getAttribute('aria-label')).toBe('Adopt the position of A-01');
    box.click();
    expect(byId<HTMLButtonElement>('compare-adopt').disabled).toBe(false);
    // Nothing has moved until the action.
    expect(markers().map((m) => [m.style.left, m.style.top])).toEqual(before);
    const wasSaved = await (async () => {
      const { stubSaveDialog, removeSaveDialog } = await import('./harness');
      stubSaveDialog();
      byId('work-save').click();
      await flush();
      removeSaveDialog();
      return !dirty();
    })();
    expect(wasSaved).toBe(true);
    byId('compare-adopt').click();
    expect(dirty()).toBe(true);
    expect(byId('compare-status').textContent).toBe('1 marker positions were adopted from the file. They are unsaved changes.');
    byId('tab-map').click();
    // A-01 now sits where the file has it (stage point 60, 100).
    expect([markers()[0].style.left, markers()[0].style.top]).toEqual(['60px', '100px']);
    expect(groups()['matched-markers']).toEqual(['1. A-01 / same position', '3. A-03 / same position']);
  });

  test('select all chooses every differing position', async () => {
    byId('tab-map').click();
    // Remove A-03's marker: it then has no marker in the current work.
    markers()[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    await openExport(page);
    expect(groups()['matched-markers']).toEqual(['1. A-01 / position differs', '3. A-03 / no marker in the current work']);
    byId('compare-select-all').click();
    expect([...document.querySelectorAll<HTMLInputElement>('.compare-select')].every((b) => b.checked)).toBe(true);
    byId('compare-adopt').click();
    expect(byId('compare-status').textContent).toBe('2 marker positions were adopted from the file. They are unsaved changes.');
    expect(markers()).toHaveLength(3);
  });

  test('the comparison follows the current work live', async () => {
    await openExport(page);
    editCell(4, 'ID', 'A-05');
    expect(groups()['file-only']).toEqual([]);
    expect(groups()['current-only']).toEqual([]);
    expect(groups()['matched-markers']).toContain('5. A-05 / no marker in the current work');
  });

  test('empty and repeated identifiers are listed as not pairable', async () => {
    editCell(3, 'ID', 'A-03');
    editCell(4, 'ID', '');
    await openExport(page);
    expect(groups().unpairable).toEqual(['3. A-03 / in the current work', '4. A-03 / in the current work', '5. No. 5 / in the current work', '3. A-03 / in the file']);
  });

  test('without the identifier role nothing is paired, and the panel says why', async () => {
    setRole('ID', '');
    await openExport(page);
    expect(byId('compare-warning').textContent).toBe('The current work has no identifier column. Assign the identifier role in the list to pair the items.');
    expect(document.querySelectorAll('#compare-groups .compare-group')).toHaveLength(0);
    expect(byId<HTMLButtonElement>('compare-adopt').disabled).toBe(true);
  });

  test('closing the comparison changes nothing', async () => {
    const before = JSON.stringify(app.captureWorkState());
    await openExport(page);
    document.querySelector<HTMLInputElement>('.compare-select')!.click();
    byId('compare-close').click();
    expect(byId('compare-panel').classList.contains('hidden')).toBe(true);
    expect(JSON.stringify(app.captureWorkState())).toBe(before);
  });

  test('an HTML file without export data, and an unknown export version, are refused with a clear message', async () => {
    await openExport('<!doctype html><html><body><p>Some page</p></body></html>', 'page.html');
    expect(byId('work-status').textContent).toBe('The file holds no MapVibes export data. Nothing was opened.');
    expect(byId('compare-panel').classList.contains('hidden')).toBe(true);
    await openExport(page.replace('"exportVersion": 1', '"exportVersion": 7'));
    expect(byId('work-status').textContent).toBe('The exported file has export format version 7, which this version of MapVibes cannot read. Nothing was opened.');
    await openExport(page.replace('"numbers": [', '"numbers": [0, '));
    expect(byId('work-status').textContent).toBe('The data embedded in the exported file could not be read. Nothing was opened.');
  });

  test('the comparison follows the language', async () => {
    await openExport(page);
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(headings()[2]).toBe('Endast i filen (1)');
    expect(byId('compare-adopt').textContent).toBe('Överta de markerade markörpositionerna');
  });
});

describe('comparison without a background', () => {
  test('positions cannot be adopted onto a work without a background', async () => {
    const page = await exportedFile();
    await mountApp();
    await importExampleWorkbook();
    setRole('ID', 'identifier');
    await openExport(page);
    expect(byId('compare-warning').textContent).toBe('The current work has no background. Marker positions can be adopted only onto a background.');
    expect(document.querySelectorAll<HTMLInputElement>('.compare-select')[0].disabled).toBe(true);
    expect(byId<HTMLButtonElement>('compare-select-all').disabled).toBe(true);
  });
});
