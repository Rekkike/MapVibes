import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, flush, importExampleWorkbook, mountApp, removeSaveDialog, setRole, stubSaveDialog } from './harness';

function panel(): HTMLElement {
  return byId('details-panel');
}

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('#row-table-body tr')];
}

function open(index: number): void {
  rows()[index].querySelector<HTMLElement>('.row-details')!.click();
}

function input(): HTMLTextAreaElement {
  return panel().querySelector<HTMLTextAreaElement>('.details-comment-input')!;
}

function add(text: string): void {
  input().value = text;
  panel().querySelector<HTMLButtonElement>('.details-comment-add')!.click();
}

function entries(): Array<[string, string]> {
  return [...panel().querySelectorAll('.details-comment')].map((li) => [
    li.querySelector('.details-comment-date')!.textContent ?? '',
    li.querySelector('.details-comment-text')!.textContent ?? '',
  ]);
}

function dirty(): boolean {
  return !byId('work-dirty').classList.contains('hidden');
}

describe('comments in the details panel (FR-15)', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2024, 3, 2, 10, 15));
    await mountApp();
    await importExampleWorkbook();
    setRole('ID', 'identifier');
  });

  afterEach(() => {
    vi.useRealTimers();
    removeSaveDialog();
  });

  test('an item without comments says so, with a field to add one', () => {
    open(0);
    expect(panel().querySelector('.details-no-comments')!.textContent).toBe('No comments.');
    expect(input().getAttribute('aria-label')).toBe('New comment');
    expect(panel().querySelector('.details-comment-add')!.textContent).toBe('Add comment');
  });

  test('a comment is appended with its date, and the field is cleared and keeps focus', () => {
    open(0);
    add('Checked on site.');
    vi.setSystemTime(new Date(2024, 3, 3, 16, 40));
    add('Second visit:\nall in order.');
    expect(entries()).toEqual([
      ['2024-04-02 10:15', 'Checked on site.'],
      ['2024-04-03 16:40', 'Second visit:\nall in order.'],
    ]);
    expect(panel().querySelector('.details-comment time')!.getAttribute('datetime')).toBe(new Date(2024, 3, 2, 10, 15).toISOString());
    expect(input().value).toBe('');
    expect(document.activeElement).toBe(input());
    expect(panel().querySelector('.details-no-comments')).toBeNull();
  });

  test('Ctrl+Enter adds the comment; an empty comment is not added', () => {
    open(0);
    input().value = 'By keyboard';
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    add('   ');
    expect(entries().map(([, text]) => text)).toEqual(['By keyboard']);
  });

  test('adding and removing a comment are unsaved changes', async () => {
    open(0);
    const written = stubSaveDialog();
    byId('work-save').click();
    await flush();
    expect(written.text).toBeDefined();
    expect(dirty()).toBe(false);
    add('Note');
    expect(dirty()).toBe(true);
    byId('work-save').click();
    await flush();
    expect(dirty()).toBe(false);
    panel().querySelector<HTMLButtonElement>('.details-comment-remove')!.click();
    expect(dirty()).toBe(true);
  });

  test('a comment is removed by its own button, labelled with its date', () => {
    open(0);
    add('Keep');
    add('Remove');
    const remove = panel().querySelectorAll<HTMLButtonElement>('.details-comment-remove')[1];
    expect(remove.getAttribute('aria-label')).toBe('Remove the comment of 2024-04-02 10:15');
    remove.click();
    expect(entries().map(([, text]) => text)).toEqual(['Keep']);
  });

  test('comments belong to the item and follow it through sorting and renumbering', () => {
    open(2);
    add('On the third item');
    open(0);
    expect(entries()).toEqual([]);
    document.querySelector<HTMLButtonElement>('th[data-header="ID"] .sort-button')!.click();
    document.querySelector<HTMLButtonElement>('th[data-header="ID"] .sort-button')!.click();
    // Descending: A-03 is now the third line shown, the first line is A-05.
    const line = rows().find((tr) => tr.querySelector<HTMLInputElement>('td[data-header="ID"] .cell-input')!.value === 'A-03')!;
    line.querySelector<HTMLElement>('.row-details')!.click();
    expect(entries().map(([, text]) => text)).toEqual(['On the third item']);
  });

  test('an unsent comment survives an edit elsewhere in the panel', () => {
    open(0);
    input().value = 'Draft';
    const field = panel().querySelector<HTMLInputElement>('dd[data-header="Note"] .cell-input')!;
    field.value = 'Changed';
    field.dispatchEvent(new Event('change'));
    expect(input().value).toBe('Draft');
  });

  test('the comment controls follow the language', () => {
    open(0);
    add('Entry');
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(input().getAttribute('aria-label')).toBe('Ny kommentar');
    expect(panel().querySelector('.details-comment-add')!.textContent).toBe('Lägg till kommentar');
    expect(panel().querySelector('.details-comment-remove')!.getAttribute('aria-label')).toBe('Ta bort kommentaren från 2024-04-02 10:15');
  });
});
