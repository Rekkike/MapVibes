import { describe, expect, test } from 'vitest';
import { byId, flush, mountApp, placeExampleMarkers, pointer, presentationMarkers, setRole, STAGE, stubImageDecoding, stubStageLayout } from './harness';
import { NARROW_QUERY } from '../../src/narrowviewer';

// The narrow viewer layout's machinery (FR-58): two overlays, "In view" and
// the legend, opened from the toggle bar one at a time, with the card's
// pattern (data-state, inert, aria-expanded, focus return), closed by
// Escape, a tap outside, or their toggle; choosing an entry in "In view"
// closes it and opens the card, which docks at the bottom of the stage. The
// layout itself is measured in the browser suite.

// A media query list for the narrow query whose match the test sets.
function controllableQuery(initial: boolean) {
  const listeners: Array<() => void> = [];
  const list = {
    matches: initial,
    media: NARROW_QUERY,
    addEventListener: (_: string, l: () => void) => listeners.push(l),
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  };
  return {
    list,
    set(matches: boolean) {
      list.matches = matches;
      for (const l of listeners) l();
    },
  };
}

async function exportedPage(): Promise<string> {
  const app = await mountApp({ singleFile: true });
  await placeExampleMarkers([
    [0, 60, 100],
    [2, 400, 300],
  ]);
  byId('tab-information').click();
  setRole('Group', 'area');
  byId('tab-presentation').click();
  await flush();
  return app.exportPage(new Date(2024, 7, 9, 10, 30))!;
}

async function mountViewer(narrow: boolean) {
  const page = await exportedPage();
  const query = controllableQuery(narrow);
  const doc = new DOMParser().parseFromString(page, 'text/html');
  await mountApp({
    body: doc.body.innerHTML,
    beforeMain: () => {
      stubStageLayout();
      stubImageDecoding(1200, 800);
      const plain = window.matchMedia;
      window.matchMedia = ((q: string) => (q === NARROW_QUERY ? query.list : plain(q))) as typeof window.matchMedia;
    },
  });
  await flush();
  return query;
}

const glance = () => byId('presentation-glance');
const legend = () => byId('presentation-legend');
const toggleGlance = () => byId<HTMLButtonElement>('toggle-glance');
const toggleLegend = () => byId<HTMLButtonElement>('toggle-legend');

function expectClosed(panel: HTMLElement, toggle: HTMLElement): void {
  expect(panel.dataset.state).toBe('closed');
  expect(panel.inert).toBe(true);
  expect(panel.hasAttribute('inert')).toBe(true);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
}

function expectOpen(panel: HTMLElement, toggle: HTMLElement): void {
  expect(panel.dataset.state).toBe('open');
  expect(panel.inert).toBe(false);
  expect(panel.hasAttribute('inert')).toBe(false);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
}

describe('the narrow viewer layout (FR-58)', () => {
  test('the toggle bar offers two overlays, "In view" and the legend, and no item list', async () => {
    await mountViewer(true);
    expect([...byId('viewer-toggles').querySelectorAll('button')].map((b) => [b.id, b.getAttribute('aria-controls')])).toEqual([
      ['toggle-glance', 'presentation-glance'],
      ['toggle-legend', 'presentation-legend'],
    ]);
    expect(byId('visibility-area').classList.contains('hidden')).toBe(true);
    expect(byId('visibility-list').children).toHaveLength(0);
  });

  test('both overlays start closed and inert', async () => {
    await mountViewer(true);
    expectClosed(glance(), toggleGlance());
    expectClosed(legend(), toggleLegend());
  });

  test('a toggle opens its overlay and moves focus into it; one overlay is open at a time; the toggle closes it again and focus returns', async () => {
    await mountViewer(true);
    toggleGlance().focus();
    toggleGlance().click();
    expectOpen(glance(), toggleGlance());
    expect(document.activeElement).toBe(glance());
    toggleLegend().click();
    expectOpen(legend(), toggleLegend());
    expectClosed(glance(), toggleGlance());
    toggleLegend().click();
    expectClosed(legend(), toggleLegend());
    expect(document.activeElement).toBe(toggleLegend());
  });

  test('Escape closes the open overlay and returns focus to its toggle', async () => {
    await mountViewer(true);
    toggleLegend().click();
    legend().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expectClosed(legend(), toggleLegend());
    expect(document.activeElement).toBe(toggleLegend());
  });

  test('a tap outside closes the open overlay; a tap inside does not', async () => {
    await mountViewer(true);
    toggleGlance().click();
    glance().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expectOpen(glance(), toggleGlance());
    pointer('pointerdown', byId('presentation-stage'), STAGE.left + 300, STAGE.top + 300);
    pointer('pointerup', byId('presentation-stage'), STAGE.left + 300, STAGE.top + 300);
    expectClosed(glance(), toggleGlance());
  });

  test('choosing an entry in "In view" closes the overlay and opens the card, docked at the bottom', async () => {
    await mountViewer(true);
    toggleGlance().click();
    byId('presentation-glance-list').querySelector<HTMLButtonElement>('.glance-entry')!.click();
    expectClosed(glance(), toggleGlance());
    const card = byId('presentation-card');
    expect(card.dataset.state).toBe('open');
    expect(card.dataset.dock).toBe('bottom');
    // No placement beside the marker: the stylesheet docks it.
    expect([card.style.left, card.style.right, card.style.top]).toEqual(['', '', '']);
    expect(document.activeElement).toBe(card.querySelector('.details-close'));
  });

  test('opening an overlay closes the card, so that they do not cover each other', async () => {
    await mountViewer(true);
    const m = presentationMarkers()[0];
    pointer('pointerdown', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
    pointer('pointerup', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
    expect(byId('presentation-card').dataset.state).toBe('open');
    toggleLegend().click();
    expect(byId('presentation-card').dataset.state).toBe('closed');
    expectOpen(legend(), toggleLegend());
  });

  test('above the threshold nothing of the narrow layout applies, also after leaving it', async () => {
    const query = await mountViewer(false);
    for (const panel of [glance(), legend()]) {
      expect(panel.dataset.state).toBeUndefined();
      expect(panel.inert).toBe(false);
      expect(panel.hasAttribute('tabindex')).toBe(false);
    }
    expect(toggleGlance().hasAttribute('aria-expanded')).toBe(false);
    // The toggles do nothing there.
    toggleGlance().click();
    expect(glance().dataset.state).toBeUndefined();
    // The card is placed beside its marker, not docked.
    const m = presentationMarkers()[0];
    pointer('pointerdown', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
    pointer('pointerup', m, STAGE.left + parseFloat(m.style.left), STAGE.top + parseFloat(m.style.top));
    expect(byId('presentation-card').dataset.dock).toBeUndefined();
    expect(byId('presentation-card').style.top).not.toBe('');
    // Entering and leaving the narrow layout leaves nothing behind.
    query.set(true);
    expectClosed(glance(), toggleGlance());
    expect(byId('presentation-card').dataset.dock).toBe('bottom');
    query.set(false);
    expect(glance().dataset.state).toBeUndefined();
    expect(glance().inert).toBe(false);
    expect(byId('presentation-card').dataset.dock).toBeUndefined();
  });

  test('in the application, outside the viewer, the narrow layout never starts', async () => {
    let asked = false;
    await mountApp({
      beforeMain: () => {
        const plain = window.matchMedia;
        window.matchMedia = ((q: string) => {
          if (q === NARROW_QUERY) asked = true;
          return plain(q);
        }) as typeof window.matchMedia;
      },
    });
    await flush();
    expect(asked).toBe(false);
    expect(glance().dataset.state).toBeUndefined();
  });

  // The stage takes a new size, as after a rotation, before the event.
  function resizeStage(width: number, height: number): void {
    byId('presentation-stage').getBoundingClientRect = () =>
      ({ left: STAGE.left, top: STAGE.top, width, height, x: STAGE.left, y: STAGE.top, right: STAGE.left + width, bottom: STAGE.top + height, toJSON: () => ({}) }) as DOMRect;
  }

  const transform = () => byId('presentation-content').style.transform;
  const inView = () => byId('presentation-glance-list').querySelectorAll('.glance-entry').length;

  test('a resize or a change of orientation refits a fitted view, and "In view" follows (unit 3)', async () => {
    await mountViewer(true);
    byId('pres-fit').click();
    const fitted = transform();
    for (const [event, size] of [
      ['orientationchange', [600, 300]],
      ['resize', [300, 600]],
    ] as const) {
      resizeStage(size[0], size[1]);
      window.dispatchEvent(new Event(event));
      expect(transform(), event).not.toBe(fitted);
      // The whole background in the new stage: 1200 × 800 fitted.
      const scale = Number(/scale\(([\d.]+)\)/.exec(transform())![1]);
      expect(scale, event).toBeCloseTo(Math.min(size[0] / 1200, size[1] / 800), 6);
      expect(inView(), event).toBe(2);
    }
  });

  test('above the threshold the handler is inert: a resize changes nothing, as in v1.3.1 (unit 3)', async () => {
    await mountViewer(false);
    byId('pres-fit').click();
    const before = transform();
    const glance = byId('presentation-glance-list').innerHTML;
    resizeStage(600, 300);
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('orientationchange'));
    expect(transform()).toBe(before);
    expect(byId('presentation-glance-list').innerHTML).toBe(glance);
  });

  test('on opening, the viewer keeps the view the file carries, also in the narrow layout (FR-38)', async () => {
    await mountViewer(true);
    // No refit at the start: the restored view stays the exported one.
    const restored = transform();
    expect(restored).not.toBe('');
    await flush();
    expect(transform()).toBe(restored);
  });
});
