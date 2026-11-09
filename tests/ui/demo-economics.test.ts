import { describe, expect, test, vi } from 'vitest';
import { byId, flush, mountApp, pointer, presentationMarkers, STAGE, stubImageDecoding, stubStageLayout } from './harness';

vi.mock('../../src/osmrender', () => ({
  renderPlanToDataUrl: (plan: { width: number; height: number }) => `data:image/png;base64,T1NN${plan.width}x${plan.height}`,
}));

// The demo's card fields and economics (FR-41 as amended in v1.6.0), in both
// languages, with its deliberate gaps.

async function demo(lang: 'en' | 'sv'): Promise<void> {
  await mountApp({
    singleFile: true,
    beforeMain: () => {
      stubStageLayout();
      stubImageDecoding(3000, 2000);
    },
  });
  const select = byId<HTMLSelectElement>('select-language');
  select.value = lang;
  select.dispatchEvent(new Event('change'));
  byId('load-demo').click();
  for (let i = 0; i < 5; i++) await flush();
  byId('tab-presentation').click();
  await flush();
}

// The card of an item, found by its identifier among the cards.
function cardByItem(item: string): HTMLElement {
  for (const m of presentationMarkers()) {
    pointer('pointerdown', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
    pointer('pointerup', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
    const c = byId('presentation-card');
    if (c.querySelector(`.card-value[data-header]`) && [...c.querySelectorAll('.card-value')].some((v) => v.textContent === item)) return c;
  }
  throw new Error(`no card for ${item}`);
}

function economics(item: string): HTMLElement {
  cardByItem(item).querySelector<HTMLButtonElement>('.card-economics')!.click();
  return byId('economics-overlay');
}

const rows = (o: HTMLElement) => [...o.querySelectorAll('.economics-table tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent!.replace(/ /g, ' ')));

for (const [lang, words] of [
  ['en', { owner: 'Project owner', manager: 'Project manager', budget: 'Budget', track: 'Outcome / Forecast', outside: "outside the item's years" }],
  ['sv', { owner: 'Projektägare', manager: 'Projektledare', budget: 'Budget', track: 'Utfall / Prognos', outside: 'utanför objektets år' }],
] as const) {
  describe(`the demo's card fields and economics (${lang})`, () => {
    test('the card shows the people columns with their own headers; a missing value says so', async () => {
      await demo(lang);
      const c = cardByItem('D-03');
      const labels = [...c.querySelectorAll('.card-label')].map((l) => l.textContent);
      expect(labels).toContain(words.owner);
      expect(labels).toContain(words.manager);
      expect(c.querySelector(`.card-value[data-header="${words.manager}"]`)!.textContent).toBe('–');
    }, 30_000);

    test('the deliberate gaps: no economics, a budget only, a year without a value, a year outside the span', async () => {
      await demo(lang);
      expect(cardByItem('D-08').querySelector('.card-economics')).toBeNull();
      let o = economics('D-03');
      expect([...o.querySelectorAll('.economics-table thead th')].map((th) => th.textContent)).toEqual([lang === 'en' ? 'Year' : 'År', words.budget]);
      expect(rows(o)[0][1]).toMatch(/ kr$/);
      o.querySelector<HTMLButtonElement>('.economics-close')!.click();
      o = economics('D-04');
      expect(rows(o).find((r) => r[0] === '2025')!.slice(1)).toEqual(['–', '–']);
      o.querySelector<HTMLButtonElement>('.economics-close')!.click();
      o = economics('D-10');
      expect(rows(o)[0][0]).toBe(`2025${words.outside}`);
      expect([...o.querySelectorAll('.economics-table thead th')].map((th) => th.textContent)[2]).toBe(words.track);
    }, 30_000);
  });
}
