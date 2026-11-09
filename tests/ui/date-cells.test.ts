import { describe, expect, test } from 'vitest';
import { byId, mountApp, placeExampleMarkers, pointer, presentationMarkers, setRole, STAGE } from './harness';

// Date cells read as dates (FR-1 as amended, FR-68): the example workbook
// with real date cells (T-01: both dates; T-02: a date and time, and a year
// as a number) shows the dates, never their serial numbers, in the list, the
// details, the card, and the at-a-glance.

describe('date cells read as dates (FR-1 as amended)', () => {
  test('every surface shows the date as the spreadsheet does', async () => {
    await mountApp();
    await placeExampleMarkers(
      [
        [0, 60, 100],
        [1, 400, 300],
      ],
      'example-dates.xlsx',
    );
    byId('tab-information').click();
    setRole('Name', 'name');
    setRole('Start', 'start');
    setRole('End', 'end');

    // The list.
    const text = [...document.querySelectorAll<HTMLInputElement>('#row-table-body .cell-input')].map((i) => i.value).join(' | ');
    for (const d of ['2024-03-15', '2026-06-30', '2024-05-02 18:00', '2025-12-31', '2025-01-10']) expect(text).toContain(d);
    expect(text).not.toMatch(/\b4\d{4}\b/);
    // The value that is not a date stays as typed.
    expect(text).toContain('15/03/2024');

    // The details.
    document.querySelectorAll<HTMLElement>('#row-table-body tr')[0].querySelector<HTMLElement>('.row-details')!.click();
    const detail = (header: string) => byId('details-panel').querySelector<HTMLInputElement>(`.details-value[data-header="${header}"] input, .details-value[data-header="${header}"] textarea`)!.value;
    expect([detail('Start'), detail('End')]).toEqual(['2024-03-15', '2026-06-30']);

    // The at-a-glance.
    byId('tab-map').click();
    const glance = [...byId('map-glance-list').querySelectorAll('.glance-entry')].map((e) => [...e.querySelectorAll('.glance-value')].map((v) => v.textContent));
    expect(glance).toEqual([
      ['2024-03-15', '2026-06-30'],
      ['2024-05-02 18:00', '2027'],
    ]);

    // The card.
    byId('tab-presentation').click();
    const m = presentationMarkers()[1];
    pointer('pointerdown', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
    pointer('pointerup', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
    const card = [...byId('presentation-card').querySelectorAll('.card-field')].map((f) => [f.querySelector('.card-label')!.textContent, f.querySelector('.card-value')!.textContent]);
    expect(card).toEqual([
      ['ID', 'T-02'],
      ['Start', '2024-05-02 18:00'],
      ['End', '2027'],
    ]);
  });
});
