import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  byId,
  editCell,
  flush,
  importExampleWorkbook,
  markers,
  mountApp,
  openWorkFile,
  removeSaveDialog,
  setRole,
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

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('#row-table-body tr')];
}

function cell(index: number, header: string): HTMLInputElement {
  return rows()[index].querySelector<HTMLInputElement>(`td[data-header="${header}"] .cell-input`)!;
}

function addComment(index: number, text: string): void {
  rows()[index].querySelector<HTMLElement>('.row-details')!.click();
  const input = byId('details-panel').querySelector<HTMLTextAreaElement>('.details-comment-input')!;
  input.value = text;
  byId('details-panel').querySelector<HTMLButtonElement>('.details-comment-add')!.click();
}

function comments(): string[] {
  return [...byId('details-panel').querySelectorAll('.details-comment-text')].map((n) => n.textContent ?? '');
}

describe('work-state schema version 5 (FR-13, FR-10, FR-15)', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2024, 5, 3, 11, 0));
    await mountApp();
  });

  afterEach(() => {
    vi.useRealTimers();
    removeSaveDialog();
  });

  test('an edited imported value is marked with its imported value; changing it back clears the mark', async () => {
    await importExampleWorkbook();
    editCell(0, 'Note', 'Edited');
    expect(cell(0, 'Note').classList.contains('edited')).toBe(true);
    expect(cell(0, 'Note').title).toBe('Edited by hand; imported value: Alpha item');
    editCell(1, 'Note', 'Filled');
    expect(cell(1, 'Note').title).toBe('Edited by hand; the imported value was empty');
    editCell(0, 'Note', 'Alpha item');
    expect(cell(0, 'Note').classList.contains('edited')).toBe(false);
  });

  test('values of rows and columns added by hand are not marked as edits', async () => {
    await importExampleWorkbook();
    byId('add-row').click();
    editCell(5, 'ID', 'M-01');
    expect(cell(5, 'ID').classList.contains('edited')).toBe(false);
  });

  test('edits and comments are saved and restored in a fresh session', async () => {
    await importExampleWorkbook();
    setRole('ID', 'identifier');
    editCell(2, 'Group', 'East');
    addComment(2, 'First entry.');
    vi.setSystemTime(new Date(2024, 5, 4, 9, 30));
    addComment(2, 'Second entry.');
    const text = await save();
    const file = JSON.parse(text);
    expect(file.schemaVersion).toBe(5);
    expect(file.rows[2].edited).toEqual({ Group: 'South' });
    expect(file.rows[2].values.Group).toBe('East');
    expect(file.rows[2].comments).toEqual([
      { date: new Date(2024, 5, 3, 11, 0).toISOString(), text: 'First entry.' },
      { date: new Date(2024, 5, 4, 9, 30).toISOString(), text: 'Second entry.' },
    ]);
    expect(file.rows[0].comments).toEqual([]);

    await mountApp();
    openWorkFile(textFile('work.json', text));
    await flush();
    expect(byId('work-status').textContent).toBe('Work opened.');
    expect(cell(2, 'Group').value).toBe('East');
    expect(cell(2, 'Group').title).toBe('Edited by hand; imported value: South');
    rows()[2].querySelector<HTMLElement>('.row-details')!.click();
    expect(comments()).toEqual(['First entry.', 'Second entry.']);
    expect([...byId('details-panel').querySelectorAll('.details-comment-date')].map((n) => n.textContent)).toEqual(['2024-06-03 11:00', '2024-06-04 09:30']);
    // Opened comments can be removed like any other.
    byId('details-panel').querySelector<HTMLButtonElement>('.details-comment-remove')!.click();
    expect(comments()).toEqual(['Second entry.']);
    expect(!byId('work-dirty').classList.contains('hidden')).toBe(true);
  });

  test('a removed row keeps its comments in the file', async () => {
    await importExampleWorkbook();
    addComment(0, 'Kept with the row.');
    byId('details-panel').querySelector<HTMLButtonElement>('.details-close')!.click();
    rows()[0].querySelector<HTMLInputElement>('.row-select')!.click();
    byId('delete-selected').click();
    const file = JSON.parse(await save());
    expect(file.rows[0].status).toBe('removed');
    expect(file.rows[0].comments.map((c: { text: string }) => c.text)).toEqual(['Kept with the row.']);
  });

  test('a damaged comment is reported in the interface language and nothing is opened', async () => {
    await importExampleWorkbook();
    addComment(0, 'Entry');
    const file = JSON.parse(await save());
    file.rows[0].comments[0].date = 'soon';
    openWorkFile(textFile('bad.json', JSON.stringify(file)));
    await flush();
    expect(byId('work-status').textContent).toContain('rows[0].comments[0] is not a valid comment (a date and some text)');
  });

  test('a schema version 4 file written by v0.7.0 still opens, with everything it holds', async () => {
    stubStageLayout();
    stubImageDecoding(1200, 800);
    const v4 = readFileSync(join(process.cwd(), 'example-data', 'example-work-state-v4.json'), 'utf8');
    openWorkFile(textFile('v4.json', v4));
    await flush();
    expect(byId('work-status').textContent).toBe('Work opened.');
    expect(byId<HTMLInputElement>('symbols-from-status').checked).toBe(true);
    expect(markers().map((m) => [m.textContent, m.dataset.shape])).toEqual([
      ['1', 'pause'],
      ['3', 'check'],
      ['5', 'gear'],
    ]);
    expect(document.querySelectorAll('#row-table-body .cell-input.edited')).toHaveLength(0);
    rows()[0].querySelector<HTMLElement>('.row-details')!.click();
    expect(byId('details-panel').querySelector('.details-no-comments')).not.toBeNull();
    expect(JSON.parse(await save()).schemaVersion).toBe(5);
  });
});
