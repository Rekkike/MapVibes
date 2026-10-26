import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, flush, mountApp, placeExampleMarkers, pointer, presentationMarkers, setRole, STAGE } from './harness';

type App = Awaited<ReturnType<typeof mountApp>>;

function card(): HTMLElement {
  return byId('presentation-card');
}

function isOpen(): boolean {
  return card().dataset.state === 'open';
}

function clickMarker(index: number): void {
  const marker = presentationMarkers()[index];
  const x = STAGE.left + parseFloat(marker.style.left);
  const y = STAGE.top + parseFloat(marker.style.top);
  pointer('pointerdown', marker, x, y);
  pointer('pointerup', marker, x, y);
}

function fields(): Array<[string, string]> {
  const labels = [...card().querySelectorAll('.card-fields dt')].map((n) => n.textContent ?? '');
  const values = [...card().querySelectorAll('.card-fields dd')].map((n) => n.textContent ?? '');
  return labels.map((l, i) => [l, values[i]]);
}

function workSnapshot(app: App): string {
  return JSON.stringify(app.captureWorkState());
}

function dirty(): boolean {
  return !byId('work-dirty').classList.contains('hidden');
}

describe('presentation data card (FR-35)', () => {
  let app: App;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2024, 4, 6, 8, 30));
    app = await mountApp();
    await placeExampleMarkers([
      [0, 60, 100],
      [2, 400, 300],
      [4, 760, 500],
    ]);
    byId('tab-information').click();
    setRole('Group', 'area');
    setRole('Start', 'start');
    setRole('End', 'end');
    setRole('Note', 'note');
    // A comment on the third item, added in the details panel.
    document.querySelectorAll<HTMLElement>('#row-table-body tr')[2].querySelector<HTMLElement>('.row-details')!.click();
    const input = byId('details-panel').querySelector<HTMLTextAreaElement>('.details-comment-input')!;
    input.value = 'Shown on the card.';
    byId('details-panel').querySelector<HTMLButtonElement>('.details-comment-add')!.click();
    byId('details-panel').querySelector<HTMLButtonElement>('.details-close')!.click();
    byId('tab-presentation').click();
    await flush();
  });

  afterEach(() => vi.useRealTimers());

  test('the card is closed and inert until a marker is clicked', () => {
    expect(isOpen()).toBe(false);
    expect(card().getAttribute('aria-hidden')).toBe('true');
    expect(card().hasAttribute('inert')).toBe(true);
  });

  test('clicking a marker opens the content-first card: the note and the comments, then the structured fields', () => {
    clickMarker(1);
    expect(isOpen()).toBe(true);
    expect(card().getAttribute('aria-hidden')).toBe('false');
    expect(card().hasAttribute('inert')).toBe(false);
    expect(card().getAttribute('role')).toBe('dialog');
    expect(card().getAttribute('aria-labelledby')).toBe('presentation-card-title');
    expect(card().querySelector('.details-title')!.textContent).toBe('A-03');
    expect(card().querySelector('.card-note')!.textContent).toBe('Beta item');
    // The empty start value is left out.
    // The identifier is the header here (no name column), so it is not repeated.
    expect(fields()).toEqual([
      ['Group', 'South'],
      ['End', '2024-03-15'],
    ]);
    expect([...card().querySelectorAll('.details-comment')].map((li) => [li.querySelector('time')!.textContent, li.querySelector('p')!.textContent])).toEqual([
      ['2024-05-06 08:30', 'Shown on the card.'],
    ]);
    expect(presentationMarkers()[1].classList.contains('selected')).toBe(true);
  });

  test('nothing on the card can be edited', () => {
    clickMarker(1);
    expect(card().querySelectorAll('input, select, textarea, [contenteditable]')).toHaveLength(0);
    expect([...card().querySelectorAll('button')].map((b) => b.className)).toEqual(['details-close icon-button']);
  });

  test('the card sits beside its marker, on the side with more room', () => {
    clickMarker(0);
    expect(card().dataset.side).toBe('right');
    expect(card().style.left).toBe(`${60 + 28}px`);
    clickMarker(2);
    expect(card().dataset.side).toBe('left');
    expect(card().style.right).toBe(`${800 - 760 + 28}px`);
    expect(card().querySelector('.details-title')!.textContent).toBe('A-05');
  });

  test('the card follows the view as it moves', () => {
    clickMarker(0);
    byId('pres-zoom-in').click();
    const marker = presentationMarkers()[0];
    expect(card().style.left).toBe(`${Math.round(parseFloat(marker.style.left) + 28)}px`);
  });

  test('closing by its button, by Escape, or on the empty stage changes nothing in the work', async () => {
    await flush();
    const before = workSnapshot(app);
    const wasDirty = dirty();
    clickMarker(1);
    expect(document.activeElement).toBe(card().querySelector('.details-close'));
    card().querySelector<HTMLButtonElement>('.details-close')!.click();
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(presentationMarkers()[1]);
    clickMarker(1);
    card().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isOpen()).toBe(false);
    clickMarker(1);
    pointer('pointerdown', byId('presentation-stage'), STAGE.left + 300, STAGE.top + 50);
    pointer('pointerup', byId('presentation-stage'), STAGE.left + 300, STAGE.top + 50);
    expect(isOpen()).toBe(false);
    expect(presentationMarkers().some((m) => m.classList.contains('selected'))).toBe(false);
    expect(workSnapshot(app)).toBe(before);
    expect(dirty()).toBe(wasDirty);
    expect(presentationMarkers()).toHaveLength(3);
  });

  test('a click inside the card neither closes it nor pans the stage', () => {
    clickMarker(1);
    const transform = byId('presentation-content').style.transform;
    const inside = card().querySelector('.card-fields')!;
    pointer('pointerdown', inside, STAGE.left + 420, STAGE.top + 300);
    pointer('pointermove', byId('presentation-stage'), STAGE.left + 520, STAGE.top + 300);
    pointer('pointerup', byId('presentation-stage'), STAGE.left + 520, STAGE.top + 300);
    expect(isOpen()).toBe(true);
    expect(byId('presentation-content').style.transform).toBe(transform);
  });

  test('an entry of the at-a-glance panel opens the card', () => {
    document.querySelectorAll<HTMLElement>('#presentation-glance-list .glance-entry')[2].click();
    expect(isOpen()).toBe(true);
    expect(card().querySelector('.details-title')!.textContent).toBe('A-05');
  });

  test('switching the item off for the presentation closes its card', () => {
    clickMarker(1);
    const id = presentationMarkers()[1].dataset.rowId!;
    document.querySelector<HTMLInputElement>(`.visibility-toggle[data-row-id="${id}"]`)!.click();
    expect(isOpen()).toBe(false);
  });

  test('the card follows the language', () => {
    clickMarker(1);
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(card().querySelector('.card-comments')!.getAttribute('aria-label')).toBe('Kommentarer');
    expect(card().querySelector('.details-close')!.getAttribute('aria-label')).toBe('Stäng');
    expect(card().querySelector('.card-fields')!.getAttribute('aria-label')).toBe('Uppgifter');
  });

  test('the details panel of the other segments stays hidden in the Presentation segment', () => {
    clickMarker(1);
    expect(byId('details-panel').classList.contains('hidden')).toBe(true);
  });

  test('the card works in both themes', () => {
    for (const theme of ['light', 'dark']) {
      const select = byId<HTMLSelectElement>('select-theme');
      select.value = theme;
      select.dispatchEvent(new Event('change'));
      expect(document.documentElement.dataset.theme).toBe(theme);
      clickMarker(1);
      expect(isOpen()).toBe(true);
      expect(card().querySelector('.details-title')!.textContent).toBe('A-03');
      card().querySelector<HTMLButtonElement>('.details-close')!.click();
      expect(isOpen()).toBe(false);
    }
  });
});
