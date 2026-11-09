import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, mountApp, placeExampleMarkers, pointer, presentationMarkers, setRole, STAGE, stubImageDecoding, stubStageLayout } from './harness';

// The economics view (FR-64) on the example workbook with year series:
// E-01 thirteen years with an outcome for the first five and a budget total
// that differs from its years; E-02 no economics; E-03 a budget only; E-04 a
// year without a value and a value that is not a number; E-05 a value
// outside its span.

type App = Awaited<ReturnType<typeof mountApp>>;

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

async function setUp(): Promise<App> {
  const app = await mountApp({ singleFile: true });
  await placeExampleMarkers(
    [
      [0, 60, 100],
      [1, 300, 150],
      [2, 500, 250],
      [3, 650, 400],
      [4, 760, 520],
    ],
    'example-economics.xlsx',
  );
  byId('tab-information').click();
  setRole('Name', 'name');
  setRole('Start', 'start');
  setRole('End', 'end');
  const role = (key: string) => document.querySelector<HTMLSelectElement>(`#series-list .series-item[data-series="${key}"] .series-role`)!;
  choose(role('budget'), 'budget');
  choose(role('prognos'), 'forecast');
  choose(role('utfall'), 'outcome');
  choose(document.querySelector<HTMLSelectElement>('#series-list .series-item[data-series="budget"] .series-total')!, 'Budget total');
  return app;
}

function openCard(index: number): HTMLElement {
  byId('tab-presentation').click();
  const m = presentationMarkers()[index];
  pointer('pointerdown', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
  pointer('pointerup', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
  return byId('presentation-card');
}

function openEconomics(index: number): HTMLElement {
  openCard(index).querySelector<HTMLButtonElement>('.card-economics')!.click();
  return byId('economics-overlay');
}

const totals = (o: HTMLElement) => [...o.querySelectorAll('.economics-total')].map((t) => [t.querySelector('dt')!.textContent, t.querySelector('dd')!.textContent]);
const rows = (o: HTMLElement) => [...o.querySelectorAll('.economics-table tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent));

describe('the economics view (FR-64)', () => {
  let app: App;

  beforeEach(async () => {
    app = await setUp();
  });

  test('an item with economics has the action on its card; one without has none', () => {
    expect(openCard(0).querySelector('.card-economics')!.textContent).toBe('Economics');
    expect(openCard(1).querySelector('.card-economics')).toBeNull();
  });

  test('the overlay opens with the totals, the composition, and the years as rows; outcome replaces forecast', () => {
    const o = openEconomics(0);
    expect(o.dataset.state).toBe('open');
    expect(o.inert).toBe(false);
    expect(o.querySelector('.economics-kicker')!.textContent).toBe('Economics');
    expect(o.querySelector('.economics-title')!.textContent).toBe('Long item');
    expect(totals(o)).toEqual([
      // The file's figure leads, the sum of the years beside it.
      ['Budget', '9,000,000 SEK (the years add up to 9,750,000 SEK)'],
      ['Utfall / Prognos', '9,570,000 SEKUtfall 2020–2024, Prognos 2025–2032'],
    ]);
    expect(o.querySelector('.economics-span')!.textContent).toBe("The item's years: 2020–2032.");
    expect([...o.querySelectorAll('.economics-table thead th')].map((th) => th.textContent)).toEqual(['Year', 'Budget', 'Utfall / Prognos']);
    const r = rows(o);
    expect(r).toHaveLength(13);
    expect(r[0]).toEqual(['2020', '600,000 SEK', '590,000 SEKUtfall']);
    expect(r[4]).toEqual(['2024', '700,000 SEK', '710,000 SEKUtfall']);
    expect(r[5]).toEqual(['2025', '725,000 SEK', '720,000 SEKPrognos']);
    expect(r[12]).toEqual(['2032', '900,000 SEK', '860,000 SEKPrognos']);
    // A bar inside each row, solid for an outcome, an outline for a forecast.
    const bars = [...o.querySelectorAll<HTMLElement>('.economics-bar')];
    expect(bars.map((b) => b.dataset.kind)).toEqual([...Array(5).fill('outcome'), ...Array(8).fill('forecast')]);
    expect(bars[12].style.width).toBe('95.6%');
    // The free-text column with a year in its header never became money.
    expect(o.textContent).not.toContain('A remark');
  });

  test('a series without values for the item is absent', () => {
    const o = openEconomics(2);
    expect(totals(o)).toEqual([['Budget', '300,000 SEK']]);
    expect([...o.querySelectorAll('.economics-table thead th')].map((th) => th.textContent)).toEqual(['Year', 'Budget']);
    expect(rows(o)).toEqual([
      ['2025', '100,000 SEK'],
      ['2026', '150,000 SEK'],
      ['2027', '50,000 SEK'],
    ]);
  });

  test('a year without a value is "–", never zero; a value that is not a number is shown as typed, outside the sums, and noted', () => {
    const o = openEconomics(3);
    expect(rows(o)).toEqual([
      ['2024', 'ca 1 M', '200,000 SEKPrognos'],
      ['2025', '–', '–'],
      ['2026', '300,000 SEK', '310,000 SEKPrognos'],
    ]);
    expect(o.querySelector('.economics-amount.is-empty')!.getAttribute('aria-label')).toBe('no value');
    expect(totals(o)[0]).toEqual(['Budget', '300,000 SEK']);
    expect(o.querySelector('.economics-texts')!.textContent).toBe('Values that are not numbers are shown as typed and are left out of the sums.');
  });

  test('a year outside the span with a value is shown and marked', () => {
    const o = openEconomics(4);
    const first = o.querySelector('.economics-table tbody tr')!;
    expect(first.classList.contains('is-outside')).toBe(true);
    expect(first.querySelector('.economics-year')!.textContent).toBe("2025outside the item's years");
    expect(totals(o)[0]).toEqual(['Budget', '450,000 SEK']);
  });

  test('Escape closes the overlay alone, and focus returns to the action', () => {
    const card = openCard(0);
    const action = card.querySelector<HTMLButtonElement>('.card-economics')!;
    action.focus();
    action.click();
    const o = byId('economics-overlay');
    expect(document.activeElement).toBe(o.querySelector('.economics-close'));
    o.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(o.dataset.state).toBe('closed');
    expect(o.inert).toBe(true);
    expect(byId('presentation-card').dataset.state).toBe('open');
    expect(document.activeElement).toBe(byId('presentation-card').querySelector('.card-economics'));
  });

  test('the currency unit and the language follow', () => {
    const unit = byId<HTMLInputElement>('currency-unit');
    unit.value = 'kr';
    unit.dispatchEvent(new Event('change'));
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    const o = openEconomics(2);
    expect(o.querySelector('.economics-kicker')!.textContent).toBe('Ekonomi');
    // Swedish groups thousands with a no-break space.
    expect(totals(o)).toEqual([['Budget', '300\u00a0000 kr']]);
    expect([...o.querySelectorAll('.economics-table thead th')].map((th) => th.textContent)).toEqual(['År', 'Budget']);
  });

  test('the exported viewer shows the view as well', async () => {
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
    const o = openEconomics(0);
    expect(o.dataset.state).toBe('open');
    expect(rows(o)).toHaveLength(13);
    expect(totals(o)[0]).toEqual(['Budget', '9,000,000 SEK (the years add up to 9,750,000 SEK)']);
  });
});
