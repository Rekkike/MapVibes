import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, mountApp, placeExampleMarkers, pointer, removeSaveDialog, setRole, STAGE, stubSaveDialog } from './harness';
import { readDataIsland } from '../../src/singlefile';
import { parseExport } from '../../src/exportfile';

// Export content selection and the card column choice (FR-53), and the
// prominence of the interactive export (FR-11 as amended in v1.3.0). What is
// not chosen must be absent from the file, not hidden in it.

function at(type: string, x: number, y: number): void {
  pointer(type, byId('map-stage'), STAGE.left + x, STAGE.top + y);
}

function areaToggle(area: string): HTMLInputElement {
  return [...document.querySelectorAll<HTMLInputElement>('.export-area-toggle')].find((b) => b.dataset.area === area)!;
}

function itemToggles(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>('.export-item-toggle')];
}

function itemToggle(label: string): HTMLInputElement {
  return itemToggles().find((b) => b.parentElement!.textContent!.includes(label))!;
}

function columnToggle(header: string): HTMLInputElement {
  return [...document.querySelectorAll<HTMLInputElement>('.export-column-toggle')].find((b) => b.dataset.header === header)!;
}

function change(box: HTMLInputElement, checked: boolean): void {
  box.checked = checked;
  box.dispatchEvent(new Event('change'));
}

async function exportFile(): Promise<{ page: string; island: string }> {
  const written = stubSaveDialog();
  byId('export-go').click();
  await flush();
  const page = written.text!;
  return { page, island: readDataIsland(new DOMParser().parseFromString(page, 'text/html'))! };
}

describe('export content selection (FR-53)', () => {
  beforeEach(async () => {
    await mountApp({ singleFile: true });
    await placeExampleMarkers([
      [0, 60, 100],
      [2, 400, 300],
      [3, 600, 300],
    ]);
    // A footprint linked to A-03 (the third item), with a label.
    document.querySelector<HTMLButtonElement>('#annotation-tools [data-tool="rectangle"]')!.click();
    at('pointerdown', 350, 250);
    at('pointermove', 450, 350);
    at('pointerup', 450, 350);
    const link = byId<HTMLSelectElement>('annotation-link');
    link.value = [...link.options].find((o) => o.textContent!.includes('A-03'))!.value;
    link.dispatchEvent(new Event('change'));
    const label = byId<HTMLInputElement>('annotation-label');
    label.value = 'Footprint of the third';
    label.dispatchEvent(new Event('change'));
    byId('tab-information').click();
    setRole('Group', 'area');
    setRole('Note', 'name');
    // A comment on A-03.
    document.querySelectorAll<HTMLElement>('#row-table-body tr')[2].querySelector<HTMLElement>('.row-details')!.click();
    byId('details-panel').querySelector<HTMLTextAreaElement>('.details-comment-input')!.value = 'Comment on the third item.';
    byId('details-panel').querySelector<HTMLButtonElement>('.details-comment-add')!.click();
    byId('details-panel').querySelector<HTMLButtonElement>('.details-close')!.click();
    byId('tab-presentation').click();
    await flush();
    // A-04 (Gamma item) switched off for the presentation.
    const toggles = [...document.querySelectorAll<HTMLInputElement>('.visibility-toggle')];
    toggles.find((t) => t.closest('li')!.textContent!.includes('Gamma item'))!.click();
  });

  afterEach(() => removeSaveDialog());

  test('the interactive export is the primary action; the documents sit beside it as secondary', () => {
    const toolbar = [...byId('presentation-toolbar').querySelectorAll('button')].map((b) => b.id);
    expect(toolbar.indexOf('export-open')).toBeLessThan(toolbar.indexOf('pdf-open'));
    expect(toolbar.indexOf('pdf-open')).toBeLessThan(toolbar.indexOf('pptx-open'));
    expect(byId('export-open').classList.contains('primary-action')).toBe(true);
    expect(byId('pdf-open').classList.contains('secondary-action')).toBe(true);
    expect(byId('pptx-open').classList.contains('secondary-action')).toBe(true);
  });

  test('the dialog lists the areas with their items and the columns; the choice starts from the visibility state', () => {
    byId('export-open').click();
    expect(byId('export-select-heading').textContent).toBe('What to share');
    const areas = [...document.querySelectorAll<HTMLInputElement>('.export-area-toggle')].map((b) => b.dataset.area);
    expect(areas).toContain('North');
    expect(areas).toContain('South');
    expect(itemToggles()).toHaveLength(5);
    // Every item is chosen except the one switched off.
    expect(itemToggles().filter((b) => !b.checked).map((b) => b.parentElement!.textContent)).toEqual(['4. Gamma item']);
    // The area holding it shows a partial choice.
    expect(itemToggle('Gamma item').closest('.export-area')!.querySelector<HTMLInputElement>('.export-area-toggle')!.indeterminate).toBe(true);
    expect([...document.querySelectorAll<HTMLInputElement>('.export-column-toggle')].every((b) => b.checked)).toBe(true);
  });

  test('an area left out is absent from the file: its items, markers, comments, linked annotations, and its name', async () => {
    byId('export-open').click();
    const before = byId('export-size').textContent;
    change(areaToggle('South'), false);
    expect(itemToggle('Beta item').checked).toBe(false);
    expect(byId('export-size').textContent).not.toBe(before);
    const { page, island } = await exportFile();
    const data = parseExport(island);
    expect(data.workState.rows.map((r) => r.values.ID)).not.toContain('A-03');
    expect(data.workState.areaValues).not.toContain('South');
    expect(data.workState.annotations).toHaveLength(0);
    // Absent, not hidden: nowhere in the file.
    for (const text of ['A-03', 'A-04', 'Beta item', 'Gamma item', 'Comment on the third item.', 'Footprint of the third']) {
      expect(island, text).not.toContain(text);
      expect(page, text).not.toContain(text);
    }
    // The area's name is not in the data (the page's own interface text has
    // a compass label of the same word).
    expect(island).not.toContain('South');
    expect(island).toContain('A-01');
  });

  test('a single item left out is absent; the area shows a partial choice', async () => {
    byId('export-open').click();
    change(itemToggle('Alpha item'), false);
    expect(areaToggle('North').checked).toBe(false);
    const { page } = await exportFile();
    expect(page).not.toContain('Alpha item');
    expect(page).not.toContain('A-01');
    expect(page).toContain('A-03');
  });

  test('an item switched off can be chosen for sharing after all', async () => {
    byId('export-open').click();
    change(itemToggle('Gamma item'), true);
    expect(itemToggle('Gamma item').closest('.export-area')!.querySelector<HTMLInputElement>('.export-area-toggle')!.checked).toBe(true);
    const { island } = await exportFile();
    expect(island).toContain('A-04');
  });

  test('a column not chosen for the cards is absent from the file; its role goes with it', async () => {
    byId('export-open').click();
    change(columnToggle('Note'), false);
    expect(byId('export-contains').querySelector('li')!.textContent).toBe('4 items, each with 4 of the 5 columns');
    const { page, island } = await exportFile();
    const data = parseExport(island);
    expect(data.workState.headers).not.toContain('Note');
    expect(data.workState.roles.name).toBeUndefined();
    for (const text of ['Alpha item', 'Beta item', 'Gamma item']) expect(page, text).not.toContain(text);
  });

  test('the dialog follows the language', () => {
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    byId('export-open').click();
    expect(byId('export-select-heading').textContent).toBe('Vad som delas');
    expect(byId('export-columns-heading').textContent).toBe('Kolumner på korten');
  });
});
