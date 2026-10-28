import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, importExampleWorkbook, markers, mountApp, placeExampleMarkers, pointer, presentationMarkers, STAGE } from './harness';

// Comment editing in the details panel (FR-15 as amended in v1.3.0, on the
// owner's decision): where comments are created; the Presentation segment
// stays view-only.

type App = Awaited<ReturnType<typeof mountApp>>;

function panel(): HTMLElement {
  return byId('details-panel');
}

function open(index: number): void {
  document.querySelectorAll<HTMLElement>('#row-table-body tr')[index].querySelector<HTMLElement>('.row-details')!.click();
}

function add(text: string): void {
  panel().querySelector<HTMLTextAreaElement>('.details-comment-input')!.value = text;
  panel().querySelector<HTMLButtonElement>('.details-comment-add')!.click();
}

function entry(i = 0): HTMLElement {
  return panel().querySelectorAll<HTMLElement>('.details-comment')[i];
}

function startEdit(i = 0): HTMLTextAreaElement {
  entry(i).querySelector<HTMLButtonElement>('.details-comment-edit')!.click();
  return entry(i).querySelector<HTMLTextAreaElement>('.details-comment-editor')!;
}

describe('comment editing (FR-15)', () => {
  let app: App;

  beforeEach(async () => {
    app = await mountApp();
    await importExampleWorkbook();
    open(0);
    add('First text');
  });

  test('each entry has an Edit action that turns its text into a field with Save and Cancel', () => {
    const button = entry().querySelector<HTMLButtonElement>('.details-comment-edit')!;
    expect(button.textContent).toBe('Edit');
    expect(button.getAttribute('aria-label')).toMatch(/^Edit the comment of \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    const field = startEdit();
    expect(field.value).toBe('First text');
    expect(document.activeElement).toBe(field);
    expect(entry().querySelector('.details-comment-save')!.textContent).toBe('Save');
    expect(entry().querySelector('.details-comment-cancel')!.textContent).toBe('Cancel');
  });

  test('saving keeps the creation date and shows the edit date; the work is unsaved', () => {
    const created = entry().querySelector('.details-comment-date')!.textContent;
    const field = startEdit();
    field.value = 'Second text';
    entry().querySelector<HTMLButtonElement>('.details-comment-save')!.click();
    expect(entry().querySelector('.details-comment-text')!.textContent).toBe('Second text');
    expect(entry().querySelector('.details-comment-date')!.textContent).toBe(created);
    expect(entry().querySelector('.details-comment-edited')!.textContent).toMatch(/^edited \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(byId('work-dirty').classList.contains('hidden')).toBe(false);
    const stored = app.captureWorkState().rows[0].comments[0];
    expect(stored.text).toBe('Second text');
    expect(stored.edited).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test('Cancel, Escape, or an empty text change nothing', () => {
    let field = startEdit();
    field.value = 'Not kept';
    entry().querySelector<HTMLButtonElement>('.details-comment-cancel')!.click();
    expect(entry().querySelector('.details-comment-text')!.textContent).toBe('First text');
    field = startEdit();
    field.value = 'Not kept either';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(entry().querySelector('.details-comment-text')!.textContent).toBe('First text');
    field = startEdit();
    field.value = '   ';
    entry().querySelector<HTMLButtonElement>('.details-comment-save')!.click();
    expect(entry().querySelector('.details-comment-text')!.textContent).toBe('First text');
    expect(entry().querySelector('.details-comment-edited')).toBeNull();
  });

  test('Ctrl+Enter saves', () => {
    const field = startEdit();
    field.value = 'By keyboard';
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));
    expect(entry().querySelector('.details-comment-text')!.textContent).toBe('By keyboard');
  });

  test('the actions follow the language', () => {
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(entry().querySelector('.details-comment-edit')!.textContent).toBe('Redigera');
    const field = startEdit();
    field.value = 'Ändrad';
    entry().querySelector<HTMLButtonElement>('.details-comment-save')!.click();
    expect(entry().querySelector('.details-comment-edited')!.textContent).toMatch(/^redigerad /);
  });
});

describe('the presentation card shows the edit, view-only (FR-15, FR-35)', () => {
  test('the card names the edit date and offers no editing', async () => {
    await mountApp();
    await placeExampleMarkers([[0, 100, 100]]);
    pointer('pointerdown', markers()[0], STAGE.left + 100, STAGE.top + 100);
    pointer('pointerup', markers()[0], STAGE.left + 100, STAGE.top + 100);
    add('Seen on the card');
    const field = startEdit();
    field.value = 'Edited for the card';
    entry().querySelector<HTMLButtonElement>('.details-comment-save')!.click();
    byId('tab-presentation').click();
    await flush();
    pointer('pointerdown', presentationMarkers()[0], STAGE.left + 100, STAGE.top + 100);
    pointer('pointerup', presentationMarkers()[0], STAGE.left + 100, STAGE.top + 100);
    const card = byId('presentation-card');
    expect(card.querySelector('.details-comment-text')!.textContent).toBe('Edited for the card');
    expect(card.querySelector('.details-comment-edited')!.textContent).toMatch(/^edited /);
    expect(card.querySelector('.details-comment-edit')).toBeNull();
  });
});
