import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, markers, mountApp, placeExampleMarkers, pointer, presentationMarkers, STAGE } from './harness';

function input(colour: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`#colour-label-list input[data-colour="${colour}"]`)!;
}

function label(colour: string, value: string): void {
  input(colour).value = value;
  input(colour).dispatchEvent(new Event('change'));
}

function legendColours(id: string): string[] {
  return [...byId(id).querySelectorAll('.legend-entry[data-colour]')].map((e) => e.textContent ?? '');
}

describe('editable colour labels (FR-45)', () => {
  beforeEach(async () => {
    await mountApp();
    await placeExampleMarkers([
      [0, 100, 100],
      [2, 400, 300],
    ]);
    byId('tab-information').click();
  });

  test('the panel offers the four colours, each named only by its own colour until the user names it', () => {
    expect(byId('colour-panel-summary').textContent).toBe('Colour labels');
    expect(byId('colour-panel-hint').textContent).toContain('no meanings of its own and never colours an item from its data');
    const inputs = [...document.querySelectorAll<HTMLInputElement>('#colour-label-list input')];
    expect(inputs.map((i) => [i.dataset.colour, i.value, i.placeholder])).toEqual([
      ['green', '', 'Green'],
      ['blue', '', 'Blue'],
      ['yellow', '', 'Yellow'],
      ['red', '', 'Red'],
    ]);
    expect(inputs[0].getAttribute('aria-label')).toBe('Label for Green');
    expect(legendColours('map-legend')).toEqual(['Green', 'Blue', 'Yellow', 'Red']);
  });

  test("the user's labels appear in both legends, the list's colour chips, the details panel, and the card", async () => {
    label('green', 'Agreed');
    label('red', 'Needs attention');
    expect(legendColours('map-legend')).toEqual(['Agreed', 'Blue', 'Yellow', 'Needs attention']);
    expect(legendColours('presentation-legend')).toEqual(['Agreed', 'Blue', 'Yellow', 'Needs attention']);
    const chip = document.querySelector<HTMLElement>('#row-table-body .colour-chip')!;
    expect(chip.title).toBe('Agreed');
    expect(chip.getAttribute('aria-label')).toBe('Colour: Agreed');
    byId('tab-map').click();
    pointer('pointerdown', markers()[0], STAGE.left + 100, STAGE.top + 100);
    pointer('pointerup', markers()[0], STAGE.left + 100, STAGE.top + 100);
    expect(byId('details-panel').querySelector('.details-colour')!.textContent).toBe('Agreed');
    byId('tab-presentation').click();
    await flush();
    pointer('pointerdown', presentationMarkers()[0], STAGE.left + 100, STAGE.top + 100);
    pointer('pointerup', presentationMarkers()[0], STAGE.left + 100, STAGE.top + 100);
    expect(byId('presentation-card').dataset.state).toBe('open');
  });

  test('labelling never changes any colour; an empty label returns to the colour name', () => {
    const before = [...document.querySelectorAll<HTMLElement>('#row-table-body .colour-chip')].map((c) => c.className);
    label('blue', 'Second');
    label('yellow', 'Third');
    expect([...document.querySelectorAll<HTMLElement>('#row-table-body .colour-chip')].map((c) => c.className)).toEqual(before);
    label('blue', '   ');
    expect(legendColours('map-legend')).toEqual(['Green', 'Blue', 'Third', 'Red']);
    expect(input('blue').value).toBe('');
  });

  test('a label is an unsaved change', async () => {
    const { stubSaveDialog, removeSaveDialog } = await import('./harness');
    stubSaveDialog();
    byId('work-save').click();
    await flush();
    removeSaveDialog();
    expect(byId('work-dirty').classList.contains('hidden')).toBe(true);
    label('green', 'Agreed');
    expect(byId('work-dirty').classList.contains('hidden')).toBe(false);
  });

  test('the colour names follow the language until labelled; labels stay as written', () => {
    label('red', 'Needs attention');
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(legendColours('map-legend')).toEqual(['Grön', 'Blå', 'Gul', 'Needs attention']);
    expect(input('green').placeholder).toBe('Grön');
    expect(input('green').getAttribute('aria-label')).toBe('Etikett för Grön');
    expect(byId('colour-panel-summary').textContent).toBe('Färgetiketter');
  });
});
