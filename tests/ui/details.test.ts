import { beforeEach, describe, expect, test } from 'vitest';
import { byId, importExampleWorkbook, markers, mountApp, placeExampleMarkers, placementItems, pointer, setRole } from './harness';

function panel(): HTMLElement {
  return byId('details-panel');
}

function isOpen(): boolean {
  return !panel().classList.contains('hidden');
}

function title(): string {
  return panel().querySelector('.details-title')!.textContent ?? '';
}

// The labels and shown values of the panel's column fields.
function fields(): Array<[string, string]> {
  const labels = [...panel().querySelectorAll('.details-fields dt')].map((n) => n.textContent ?? '');
  const values = [...panel().querySelectorAll<HTMLElement>('.details-fields dd')].map((dd) => {
    const control = dd.querySelector<HTMLInputElement | HTMLSelectElement>('input, select, textarea');
    return control ? control.value : (dd.classList.contains('is-empty') ? '' : (dd.textContent ?? ''));
  });
  return labels.map((l, i) => [l, values[i]]);
}

function facts(): string[] {
  return [...panel().querySelectorAll('.details-facts dd')].map((n) => n.textContent ?? '');
}

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('#row-table-body tr')];
}

describe('details panel (FR-7, FR-16)', () => {
  beforeEach(async () => {
    await mountApp();
  });

  test('the panel is closed until an item is selected', async () => {
    await importExampleWorkbook();
    expect(isOpen()).toBe(false);
    expect(panel().children.length).toBe(0);
  });

  test('selecting a line in the list shows the complete item data', async () => {
    await importExampleWorkbook();
    setRole('ID', 'identifier');
    rows()[2].querySelector<HTMLElement>('td:nth-child(4)')!.click();
    expect(isOpen()).toBe(true);
    expect(title()).toBe('A-03');
    expect(panel().querySelector('.details-badge')!.textContent).toBe('3');
    expect(facts()).toEqual(['3', 'Green', 'Circle']);
    expect(fields()).toEqual([
      ['ID', 'A-03'],
      ['Start', ''],
      ['End', '2024-03-15'],
      ['Group', 'South'],
      ['Note', 'Beta item'],
    ]);
    expect(panel().querySelector('.details-comments .details-subheading')!.textContent).toBe('Comments');
    expect(panel().querySelector('.details-no-comments')!.textContent).toBe('No comments.');
    expect(rows()[2].dataset.details).toBe('true');
  });

  test('the number button opens the panel and moves focus into it; closing returns focus', async () => {
    await importExampleWorkbook();
    const button = rows()[0].querySelector<HTMLButtonElement>('.row-details')!;
    expect(button.getAttribute('aria-label')).toBe('Show details: No. 1');
    button.focus();
    button.click();
    expect(isOpen()).toBe(true);
    expect(document.activeElement).toBe(panel().querySelector('.details-close'));
    expect(panel().getAttribute('aria-labelledby')).toBe('details-panel-title');
    panel().querySelector<HTMLElement>('.details-close')!.click();
    expect(isOpen()).toBe(false);
    expect(document.activeElement?.classList.contains('row-details')).toBe(true);
  });

  test('a click on a control of the line does not open the panel', async () => {
    await importExampleWorkbook();
    rows()[0].querySelector<HTMLInputElement>('.row-select')!.click();
    rows()[0].querySelector<HTMLElement>('.colour-chip')!.click();
    expect(isOpen()).toBe(false);
  });

  test('hidden columns are still listed in the panel', async () => {
    await importExampleWorkbook();
    const toggle = [...document.querySelectorAll<HTMLInputElement>('#column-visibility input')].find((i) => i.dataset.header === 'Note')!;
    toggle.click();
    rows()[0].querySelector<HTMLElement>('.row-details')!.click();
    expect(fields().map(([label]) => label)).toContain('Note');
  });

  test('the panel follows the live data: colour, renumbering, and removal', async () => {
    await importExampleWorkbook();
    setRole('ID', 'identifier');
    rows()[1].querySelector<HTMLElement>('.row-details')!.click();
    expect(facts()[0]).toBe('2');
    rows()[1].querySelector<HTMLElement>('.colour-chip')!.click();
    expect(facts()[1]).toBe('Blue');
    expect(panel().querySelector('.details-badge')!.className).toContain('marker-blue');
    // Removing the first row renumbers the item shown.
    rows()[0].querySelector<HTMLInputElement>('.row-select')!.click();
    byId('delete-selected').click();
    expect(title()).toBe('A-02');
    expect(facts()[0]).toBe('1');
    // Removing the item itself closes the panel.
    rows()[0].querySelector<HTMLInputElement>('.row-select')!.click();
    byId('delete-selected').click();
    expect(isOpen()).toBe(false);
  });

  test('the panel follows the selection to another line', async () => {
    await importExampleWorkbook();
    setRole('ID', 'identifier');
    rows()[0].querySelector<HTMLElement>('.row-details')!.click();
    rows()[3].querySelector<HTMLElement>('.row-details')!.click();
    expect(title()).toBe('A-04');
    expect(rows().filter((r) => r.dataset.details === 'true').length).toBe(1);
  });

  test('Escape closes the panel', async () => {
    await importExampleWorkbook();
    rows()[0].querySelector<HTMLElement>('.row-details')!.click();
    panel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isOpen()).toBe(false);
  });

  test('the panel follows the language', async () => {
    await importExampleWorkbook();
    rows()[0].querySelector<HTMLElement>('.row-details')!.click();
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(panel().querySelector('.details-subheading')!.textContent).toBe('Kommentarer');
    expect(facts()[1]).toBe('Grön');
    expect(panel().querySelector('.details-close')!.getAttribute('aria-label')).toBe('Stäng');
  });
});

describe('details panel in the Map segment (FR-7)', () => {
  beforeEach(async () => {
    await mountApp();
    await placeExampleMarkers([
      [0, 100, 100],
      [1, 400, 300],
    ]);
  });

  test('selecting a marker opens its details; selecting another follows it', () => {
    pointer('pointerdown', markers()[1], 0, 0);
    pointer('pointerup', markers()[1], 0, 0);
    expect(isOpen()).toBe(true);
    expect(title()).toBe('A-02');
    pointer('pointerdown', markers()[0], 0, 0);
    pointer('pointerup', markers()[0], 0, 0);
    expect(title()).toBe('A-01');
  });

  test('an entry of the at-a-glance panel opens its details', () => {
    document.querySelectorAll<HTMLElement>('#map-glance-list .glance-entry')[1].click();
    expect(title()).toBe('A-02');
  });

  test('an item of the placement list opens its details, placed or not', () => {
    placementItems()[3].click();
    expect(title()).toBe('A-04');
    placementItems()[0].click();
    expect(title()).toBe('A-01');
  });

  test('the symbol shown follows a change of the marker shape', () => {
    placementItems()[0].click();
    const shape = byId<HTMLSelectElement>('marker-shape');
    shape.value = 'diamond';
    shape.dispatchEvent(new Event('change'));
    expect(facts()[2]).toBe('Diamond');
  });

  test('the panel is hidden in the Presentation segment and returns afterwards', () => {
    placementItems()[0].click();
    byId('tab-presentation').click();
    expect(isOpen()).toBe(false);
    byId('tab-map').click();
    expect(isOpen()).toBe(true);
    expect(title()).toBe('A-01');
  });
});
