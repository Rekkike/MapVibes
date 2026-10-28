import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, editCell, flush, mountApp, placeExampleMarkers, removeSaveDialog, setRole, stubSaveDialog } from './harness';
import { DATA_ISLAND_ID, readDataIsland } from '../../src/singlefile';
import { parseExport } from '../../src/exportfile';

function lines(id: string): string[] {
  return [...byId(id).querySelectorAll('li')].map((li) => li.textContent ?? '');
}

function parsePage(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

async function exportFile(): Promise<string> {
  const written = stubSaveDialog();
  byId('export-open').click();
  byId('export-go').click();
  await flush();
  removeSaveDialog();
  expect(written.name).toBe('mapvibes-presentation.html');
  return written.text!;
}

describe('interactive export (FR-11, FR-39)', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2024, 6, 1, 12, 0));
    await mountApp({ singleFile: true });
    await placeExampleMarkers([
      [0, 60, 100],
      [2, 400, 300],
      [4, 760, 500],
    ]);
    byId('tab-information').click();
    setRole('Group', 'area');
    // A comment, an edit, a removed row, and an item switched off.
    document.querySelectorAll<HTMLElement>('#row-table-body tr')[2].querySelector<HTMLElement>('.row-details')!.click();
    byId('details-panel').querySelector<HTMLTextAreaElement>('.details-comment-input')!.value = 'Exported comment.';
    byId('details-panel').querySelector<HTMLButtonElement>('.details-comment-add')!.click();
    byId('details-panel').querySelector<HTMLButtonElement>('.details-close')!.click();
    editCell(0, 'Note', 'Edited note');
    document.querySelectorAll<HTMLElement>('#row-table-body tr')[3].querySelector<HTMLInputElement>('.row-select')!.click();
    byId('delete-selected').click();
    byId('tab-presentation').click();
    await flush();
    const toggle = [...document.querySelectorAll<HTMLInputElement>('.visibility-toggle')][2];
    toggle.click();
  });

  afterEach(() => {
    vi.useRealTimers();
    removeSaveDialog();
  });

  test('the export action is in the Presentation segment', () => {
    expect(byId('presentation-toolbar').contains(byId('export-open'))).toBe(true);
    expect(byId('export-open').textContent).toBe('Export presentation');
    expect(byId('export-panel').classList.contains('hidden')).toBe(true);
  });

  test('the dialog states plainly what the file will and will not contain, before anything is written', () => {
    const written = stubSaveDialog();
    byId('export-open').click();
    expect(byId('export-panel').classList.contains('hidden')).toBe(false);
    expect(written.name).toBeUndefined();
    expect(byId('export-intro').textContent).toContain('readable form');
    expect(lines('export-contains')).toEqual([
      '3 items, each with all 5 columns',
      '2 markers with their positions, colours, and symbols',
      '1 comment with its date',
      'the background image (1200 × 800 pixels)',
      'the area values and the statuses with their symbols',
      'the language and theme settings',
    ]);
    expect(lines('export-omitted')).toEqual([
      '1 row removed from the list',
      '1 item not chosen for sharing, with its marker, comments, and linked annotations',
      '0 columns not chosen',
      'the values as imported before your edits (1 edited value)',
      'column presets',
    ]);
    expect(byId('export-size').textContent).toMatch(/^File size: \d+ kB\.$/);
  });

  test('hidden columns are named in the dialog', () => {
    byId('tab-information').click();
    [...document.querySelectorAll<HTMLInputElement>('#column-visibility input')].find((i) => i.dataset.header === 'End')!.click();
    byId('tab-presentation').click();
    byId('export-open').click();
    expect(lines('export-contains')[0]).toBe('3 items, each with all 5 columns, including the 1 column hidden in the list');
  });

  test('the file is the application page with the data island; the stated size is the size written', async () => {
    byId('export-open').click();
    const stated = byId('export-size').textContent;
    byId('export-cancel').click();
    const html = await exportFile();
    expect(html.startsWith('<!doctype html>')).toBe(true);
    const doc = parsePage(html);
    expect(doc.querySelector('script[type="module"]')!.textContent).toBe('/* the application bundle */');
    expect(doc.getElementById(DATA_ISLAND_ID)!.getAttribute('type')).toBe('application/json');
    expect(doc.getElementById('presentation-stage')).not.toBeNull();
    const kb = Math.max(1, Math.round(new Blob([html]).size / 1024));
    expect(stated).toBe(`File size: ${kb} kB.`);
    expect(byId('export-status').textContent).toBe('The presentation was exported.');
    expect(byId('export-panel').classList.contains('hidden')).toBe(true);
  });

  test('switched-off items and removed rows are absent from the file, not hidden; numbers are those of the presentation', async () => {
    const html = await exportFile();
    const text = readDataIsland(parsePage(html))!;
    // Absent: the switched-off item (A-05) and the removed row (A-04).
    expect(text).not.toContain('A-05');
    expect(text).not.toContain('A-04');
    expect(text).not.toContain('Delta item');
    expect(html).not.toContain('Delta item');
    const data = parseExport(text);
    expect(data.workState.rows.map((r) => r.values.ID)).toEqual(['A-01', 'A-02', 'A-03']);
    expect(data.numbers).toEqual([1, 2, 3]);
    expect(data.workState.excluded).toEqual([]);
    expect(data.workState.markers.map((m) => m.row)).toEqual([0, 2]);
    expect(data.workState.rows[2].comments.map((c) => c.text)).toEqual(['Exported comment.']);
    // The value as imported before the edit is not shared.
    expect(data.workState.rows[0].values.Note).toBe('Edited note');
    expect(text).not.toContain('Alpha item');
    expect(data.workState.presets).toEqual([]);
    expect(data.workState.segment).toBe('presentation');
    expect([data.lang, data.theme]).toEqual(['en', 'system']);
    expect(data.workState.background!.src.startsWith('data:image/png;base64,')).toBe(true);
  });

  test('numbers keep the gaps of the presentation when an item in the middle is switched off', async () => {
    // Switch the first item back on and the second off: 1 and 3 remain.
    const toggle = (i: number) => document.querySelectorAll<HTMLInputElement>('.visibility-toggle')[i].click();
    toggle(2);
    toggle(1);
    const data = parseExport(readDataIsland(parsePage(await exportFile()))!);
    expect(data.workState.rows.map((r) => r.values.ID)).toEqual(['A-01', 'A-02', 'A-05']);
    expect(data.numbers).toEqual([1, 2, 4]);
  });

  test('the data is readable in the file', async () => {
    const text = readDataIsland(parsePage(await exportFile()))!;
    expect(text).toContain('"format": "mapvibes-export"');
    expect(text).toContain('"exportVersion": 2');
    expect(text).toContain('"Exported comment."');
    expect(text.split('\n').length).toBeGreaterThan(50);
  });

  test('exporting does not change the work', async () => {
    const app = await import('../../src/main');
    const before = JSON.stringify(app.captureWorkState());
    const dirty = !byId('work-dirty').classList.contains('hidden');
    await exportFile();
    expect(JSON.stringify(app.captureWorkState())).toBe(before);
    expect(!byId('work-dirty').classList.contains('hidden')).toBe(dirty);
  });

  test('cancelling the dialog or the save dialog writes nothing', async () => {
    const written = stubSaveDialog('cancel');
    byId('export-open').click();
    byId('export-cancel').click();
    expect(written.name).toBeUndefined();
    byId('export-open').click();
    byId('export-go').click();
    await flush();
    expect(written.text).toBeUndefined();
    expect(byId('export-status').textContent).toBe('The export was cancelled. Nothing was written.');
  });

  test('Escape closes the dialog', () => {
    byId('export-open').click();
    byId('export-panel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(byId('export-panel').classList.contains('hidden')).toBe(true);
  });

  test('the dialog follows the language', () => {
    byId('export-open').click();
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(byId('export-contains-heading').textContent).toBe('Filen kommer att innehålla');
    expect(lines('export-contains')[0]).toBe('3 objekt, vart och ett med alla 5 kolumner');
  });
});

describe('export without a single-file page', () => {
  test('on the development server the export explains that it is unavailable', async () => {
    await mountApp();
    byId('tab-presentation').click();
    byId('export-open').click();
    expect(byId('export-panel').classList.contains('hidden')).toBe(true);
    expect(byId('export-status').textContent).toContain('only in the built application');
  });
});
