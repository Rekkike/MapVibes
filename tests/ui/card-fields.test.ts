import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, mountApp, placeExampleMarkers, pointer, presentationMarkers, setRole, STAGE, stubImageDecoding, stubStageLayout } from './harness';
import { parseWorkState, serialiseWorkState } from '../../src/workstate';

// Card fields (FR-62, FR-37 as amended in v1.6.0) and the export's column
// list in its true meaning (FR-53 as corrected in v1.6.0).

type App = Awaited<ReturnType<typeof mountApp>>;

async function setUp(): Promise<App> {
  const app = await mountApp({ singleFile: true });
  // E-01 (Owner A), E-02 (no owner), E-03 (Owner B).
  await placeExampleMarkers(
    [
      [0, 60, 100],
      [1, 400, 300],
      [2, 700, 500],
    ],
    'example-economics.xlsx',
  );
  byId('tab-information').click();
  setRole('Name', 'name');
  setRole('Start', 'start');
  setRole('End', 'end');
  return app;
}

function openCard(index: number): HTMLElement {
  byId('tab-presentation').click();
  const m = presentationMarkers()[index];
  pointer('pointerdown', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
  pointer('pointerup', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
  return byId('presentation-card');
}

function fields(card: HTMLElement): string[][] {
  return [...card.querySelectorAll('.card-field')].map((f) => [f.querySelector('.card-label')!.textContent!, f.querySelector('.card-value')!.textContent!]);
}

function toggle(header: string, on: boolean): void {
  byId('tab-information').click();
  const box = document.querySelector<HTMLInputElement>(`#card-fields-list .card-field-toggle[data-header="${header}"]`)!;
  box.checked = on;
  box.dispatchEvent(new Event('change'));
}

describe('card fields (FR-62)', () => {
  let app: App;

  beforeEach(async () => {
    app = await setUp();
  });

  test('without a choice the card shows the role fields, as before', () => {
    expect(byId('card-fields-summary').textContent).toBe('Card fields');
    expect(fields(openCard(0))).toEqual([
      ['ID', 'E-01'],
      ['Start', '2020'],
      ['End', '2032'],
    ]);
    expect(app.captureWorkState().cardColumns).toBeNull();
  });

  test('a chosen column without a role appears, labelled with the header as typed; without a value it says so', () => {
    toggle('Owner', true);
    expect(fields(openCard(0))).toEqual([
      ['ID', 'E-01'],
      ['Start', '2020'],
      ['End', '2032'],
      ['Owner', 'Owner A'],
    ]);
    const card = openCard(1);
    const owner = card.querySelector<HTMLElement>('.card-value[data-header="Owner"]')!;
    expect(owner.textContent).toBe('–');
    expect(owner.getAttribute('aria-label')).toBe('no data');
    toggle('ID', false);
    expect(fields(openCard(0)).map((f) => f[0])).toEqual(['Start', 'End', 'Owner']);
    // The default returns.
    byId('card-fields-reset').click();
    expect(app.captureWorkState().cardColumns).toBeNull();
    expect(fields(openCard(0)).map((f) => f[0])).toEqual(['ID', 'Start', 'End']);
  });

  test('the choice persists in the work state', async () => {
    toggle('Owner', true);
    const back = parseWorkState(serialiseWorkState(app.captureWorkState(), new Date()));
    expect(back.cardColumns).toEqual(['ID', 'Start', 'End', 'Owner']);
  });

  test("the export list chooses what travels; the exported card shows the work's card fields among it", async () => {
    toggle('Owner', true);
    byId('tab-presentation').click();
    byId('export-open').click();
    expect(byId('export-columns-hint').textContent).toBe("The columns that travel in the file, with their values; the exported cards show the work's card fields among them. A column not chosen is left out of the file entirely.");
    // Leave Start out of the file.
    const start = document.querySelector<HTMLInputElement>('.export-column-toggle[data-header="Start"]')!;
    start.checked = false;
    start.dispatchEvent(new Event('change'));
    const page = app.exportPage(new Date(2026, 10, 9, 10, 0))!;
    const doc = new DOMParser().parseFromString(page, 'text/html');
    await mountApp({
      body: doc.body.innerHTML,
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(1200, 800);
      },
    });
    await flush();
    const card = openCard(0);
    expect(fields(card)).toEqual([
      ['ID', 'E-01'],
      ['End', '2032'],
      ['Owner', 'Owner A'],
    ]);
  });

  test('the picker follows the language', () => {
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(byId('card-fields-summary').textContent).toBe('Kortfält');
    expect(byId('card-fields-reset').textContent).toBe('Använd rollernas fält');
  });
});
