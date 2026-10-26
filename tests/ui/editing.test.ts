import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  byId,
  cellValue,
  editCell,
  flush,
  importExampleWorkbook,
  mountApp,
  openWorkFile,
  placementItems,
  removeSaveDialog,
  setRole,
  stubSaveDialog,
  textFile,
} from './harness';

async function save(): Promise<string> {
  const written = stubSaveDialog();
  byId('work-save').click();
  await flush();
  removeSaveDialog();
  return written.text!;
}

function dirty(): boolean {
  return !byId('work-dirty').classList.contains('hidden');
}

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('#row-table-body tr')];
}

function listValues(index: number): string[] {
  return [...rows()[index].querySelectorAll('td[data-header]')].map(cellValue);
}

function panelControl(header: string): HTMLInputElement | HTMLSelectElement {
  const control = document.querySelector<HTMLInputElement | HTMLSelectElement>(`#details-panel dd[data-header="${header}"] .cell-input`);
  if (!control) throw new Error(`no panel control for ${header}`);
  return control;
}

function commit(control: HTMLInputElement | HTMLSelectElement, value: string): void {
  control.value = value;
  control.dispatchEvent(new Event('change'));
}

describe('value editing (FR-10)', () => {
  beforeEach(async () => {
    await mountApp();
    await importExampleWorkbook();
    setRole('ID', 'identifier');
  });

  afterEach(() => removeSaveDialog());

  test('every value of an imported list is an editable field in the list', () => {
    const cells = rows().flatMap((tr) => [...tr.querySelectorAll('td[data-header]')]);
    expect(cells).toHaveLength(25);
    expect(cells.every((td) => td.querySelector('input.cell-input'))).toBe(true);
    expect(rows()[0].querySelector('.cell-input')!.getAttribute('aria-label')).toBe('ID, No. 1');
  });

  test('editing an imported value in the list is an unsaved change and updates every view', async () => {
    await save();
    expect(dirty()).toBe(false);
    editCell(0, 'ID', 'A-10');
    expect(dirty()).toBe(true);
    expect(listValues(0)[0]).toBe('A-10');
    expect(placementItems()[0].querySelector('.placement-label')!.textContent).toBe('A-10');
    // An unchanged value is not a change.
    await save();
    editCell(0, 'ID', 'A-10');
    expect(dirty()).toBe(false);
  });

  test('every field of the details panel is editable; an edit there reaches the list', async () => {
    rows()[1].querySelector<HTMLElement>('.row-details')!.click();
    expect(document.querySelectorAll('#details-panel .details-fields .cell-input')).toHaveLength(5);
    await save();
    commit(panelControl('Note'), 'Edited note');
    expect(dirty()).toBe(true);
    expect(listValues(1)[4]).toBe('Edited note');
    expect(panelControl('Note').value).toBe('Edited note');
    // The title follows an edit of the identifier.
    commit(panelControl('ID'), 'A-20');
    expect(byId('details-panel').querySelector('.details-title')!.textContent).toBe('A-20');
  });

  test('an edit in the panel keeps the edited field itself, so focus and tab order are undisturbed', () => {
    rows()[0].querySelector<HTMLElement>('.row-details')!.click();
    const field = panelControl('Start');
    const other = panelControl('Note');
    field.focus();
    commit(field, '2024-01-06');
    expect(panelControl('Start')).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(field.classList.contains('edited')).toBe(true);
    // The other fields are refreshed.
    expect(panelControl('Note')).not.toBe(other);
    expect(panelControl('Note').value).toBe('Alpha item');
  });

  test('a structural change (a new comment) renders the panel anew', () => {
    rows()[0].querySelector<HTMLElement>('.row-details')!.click();
    const field = panelControl('Start');
    const input = document.querySelector<HTMLTextAreaElement>('#details-panel .details-comment-input')!;
    input.value = 'Entry';
    document.querySelector<HTMLButtonElement>('#details-panel .details-comment-add')!.click();
    expect(panelControl('Start')).not.toBe(field);
  });

  test('an edit in the list is shown live in the open panel', () => {
    rows()[2].querySelector<HTMLElement>('.row-details')!.click();
    editCell(2, 'Note', 'Changed in the list');
    expect(panelControl('Note').value).toBe('Changed in the list');
  });

  test('in the panel, the area field is the combobox and the status field chooses from the list', () => {
    setRole('Group', 'area');
    setRole('Note', 'status');
    rows()[0].querySelector<HTMLElement>('.row-details')!.click();
    expect(panelControl('Group').getAttribute('list')).toBe('area-values');
    expect(panelControl('Note').tagName).toBe('SELECT');
    commit(panelControl('Group'), 'East');
    expect(cellValue(rows()[0].querySelector('td[data-header="Group"]')!)).toBe('East');
    // A new area value joins the area vocabulary (FR-32).
    expect([...document.querySelectorAll('#area-values option')].map((o) => (o as HTMLOptionElement).value)).toContain('East');
  });

  test('focusing a cell of another line moves the open panel to that line', () => {
    rows()[0].querySelector<HTMLElement>('.row-details')!.click();
    rows()[3].querySelector<HTMLElement>('.cell-input')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(byId('details-panel').querySelector('.details-title')!.textContent).toBe('A-04');
  });

  test('edited imported values are stored in the work state and restored on opening', async () => {
    editCell(3, 'Group', 'West');
    editCell(4, 'Start', '2024-05-05');
    const text = await save();
    await mountApp();
    openWorkFile(textFile('work.json', text));
    await flush();
    expect(cellValue(rows()[3].querySelector('td[data-header="Group"]')!)).toBe('West');
    expect(cellValue(rows()[4].querySelector('td[data-header="Start"]')!)).toBe('2024-05-05');
  });
});
