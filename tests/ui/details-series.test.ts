import { beforeEach, describe, expect, test } from 'vitest';
import { byId, importExampleWorkbook, mountApp, setRole } from './harness';

// The details panel groups each assigned year series (FR-7 as amended in
// v1.6.0), its year values editable inside the group, with the Economics
// action (FR-64).

type App = Awaited<ReturnType<typeof mountApp>>;

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

function openDetails(index: number): HTMLElement {
  document.querySelectorAll<HTMLElement>('#row-table-body tr')[index].querySelector<HTMLElement>('.row-details')!.click();
  return byId('details-panel');
}

const groups = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLElement>('.details-series')];
const topLabels = (panel: HTMLElement) => [...panel.querySelectorAll(':scope .details-fields > .details-field:not(.details-series):not(.details-economics-row) .details-label')].map((d) => d.textContent);

describe('series groups in the details panel (FR-7)', () => {
  let app: App;

  beforeEach(async () => {
    app = await mountApp();
    await importExampleWorkbook('example-economics.xlsx');
    setRole('ID', 'identifier');
    setRole('Start', 'start');
    setRole('End', 'end');
    const role = (key: string) => document.querySelector<HTMLSelectElement>(`#series-list .series-item[data-series="${key}"] .series-role`)!;
    choose(role('budget'), 'budget');
    choose(role('prognos'), 'forecast');
    choose(role('utfall'), 'outcome');
    choose(document.querySelector<HTMLSelectElement>('#series-list .series-item[data-series="budget"] .series-total')!, 'Budget total');
  });

  test('each assigned series is one line, collapsed; the other columns stay as they are', () => {
    const panel = openDetails(0);
    expect(groups(panel).map((g) => [g.dataset.role, g.querySelector('summary')!.textContent, g.querySelectorAll('.details-label').length])).toEqual([
      ['budget', 'Budget · 2020–2032', 14],
      ['forecast', 'Prognos · 2020–2032', 13],
      ['outcome', 'Utfall · 2020–2024', 5],
    ]);
    expect(groups(panel).every((g) => !g.querySelector('details')!.open)).toBe(true);
    // The free-text column with a year in its header is not money.
    expect(topLabels(panel)).toEqual(['ID', 'Name', 'Start', 'End', 'Owner', 'Note 2024']);
  });

  test('a year value is edited inside its group, and the group stays open', () => {
    const panel = openDetails(0);
    const box = groups(panel)[0].querySelector('details')!;
    box.open = true;
    box.dispatchEvent(new Event('toggle'));
    const input = panel.querySelector<HTMLInputElement>('.details-value[data-header="Budget 2021"] .cell-input')!;
    input.value = '640000';
    input.dispatchEvent(new Event('change'));
    expect(app.captureWorkState().rows[0].values['Budget 2021']).toBe('640000');
    expect(groups(byId('details-panel'))[0].querySelector('details')!.open).toBe(true);
  });

  test('the Economics action opens the same overlay; an item without economics has none', () => {
    let panel = openDetails(0);
    const action = panel.querySelector<HTMLButtonElement>('.details-economics')!;
    expect(action.textContent).toBe('Economics');
    action.click();
    const overlay = byId('economics-overlay');
    expect(overlay.dataset.state).toBe('open');
    expect(overlay.querySelector('.economics-title')!.textContent).toBe('E-01');
    overlay.querySelector<HTMLButtonElement>('.economics-close')!.click();
    expect(overlay.dataset.state).toBe('closed');
    panel = openDetails(1);
    expect(panel.querySelector('.details-economics')).toBeNull();
  });
});
