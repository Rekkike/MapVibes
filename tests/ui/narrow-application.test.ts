import { describe, expect, test } from 'vitest';
import { byId, flush, mountApp, placeExampleMarkers, pointer, setRole, STAGE } from './harness';
import { NARROW_QUERY } from '../../src/narrowviewer';

// The narrow application layout's machinery (FR-71 to FR-74): the overlays
// of the Map and Presentation segments, opened from their toggle bars one
// at a time in the viewer's pattern (data-state, inert, aria-expanded, focus
// moved in and returned), closed by their toggle, Escape, a tap outside, or
// a change of segment; choosing an entry of the item list closes the
// overlay. The layout itself is measured in the browser suite.

// Mounts the application with the narrow query matching, and the demo-like
// example: three items, two of them placed.
async function mountNarrow() {
  const app = await mountApp({
    beforeMain: () => {
      const plain = window.matchMedia.bind(window);
      window.matchMedia = (q: string) => (q === NARROW_QUERY ? { ...plain(q), matches: true } : plain(q));
    },
  });
  await placeExampleMarkers([
    [0, 60, 100],
    [2, 400, 300],
  ]);
  byId('tab-information').click();
  setRole('Group', 'area');
  byId('tab-map').click();
  await flush();
  return app;
}

const expectOpen = (panel: string, toggle: string) => {
  expect(byId(panel).dataset.state, panel).toBe('open');
  expect(byId(panel).inert, panel).toBe(false);
  expect(byId(toggle).getAttribute('aria-expanded'), toggle).toBe('true');
};
const expectClosed = (panel: string, toggle: string) => {
  expect(byId(panel).dataset.state, panel).toBe('closed');
  expect(byId(panel).inert, panel).toBe(true);
  expect(byId(toggle).getAttribute('aria-expanded'), toggle).toBe('false');
};

const MAP = [
  ['placement-area', 'toggle-items'],
  ['map-glance', 'toggle-map-glance'],
  ['map-legend', 'toggle-map-legend'],
] as const;

describe('the narrow application overlays (FR-72)', () => {
  test('the Map segment\'s toggle bar offers the item list, "In view", and the legend, all closed and inert at first', async () => {
    await mountNarrow();
    expect([...byId('map-toggles').querySelectorAll('button')].map((b) => [b.textContent, b.getAttribute('aria-controls')])).toEqual([
      ['Items', 'placement-area'],
      ['In view', 'map-glance'],
      ['Legend', 'map-legend'],
    ]);
    expect(byId('map-toggles').getAttribute('aria-label')).toBe('Panels');
    for (const [panel, toggle] of MAP) {
      expectClosed(panel, toggle);
    }
  });

  test('a toggle opens its overlay and moves focus into it; one is open at a time; the toggle closes it and focus returns', async () => {
    await mountNarrow();
    byId('toggle-items').focus();
    byId('toggle-items').click();
    expectOpen('placement-area', 'toggle-items');
    expect(document.activeElement).toBe(byId('placement-area'));
    byId('toggle-map-legend').click();
    expectOpen('map-legend', 'toggle-map-legend');
    expectClosed('placement-area', 'toggle-items');
    byId('toggle-map-legend').click();
    expectClosed('map-legend', 'toggle-map-legend');
    expect(document.activeElement).toBe(byId('toggle-map-legend'));
  });

  test('Escape closes the open overlay and returns focus to its toggle; a tap outside closes it', async () => {
    await mountNarrow();
    byId('toggle-map-glance').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expectClosed('map-glance', 'toggle-map-glance');
    expect(document.activeElement).toBe(byId('toggle-map-glance'));
    byId('toggle-map-glance').click();
    byId('map-stage').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expectClosed('map-glance', 'toggle-map-glance');
  });

  test('choosing an entry of the item list closes the overlay and opens the details', async () => {
    await mountNarrow();
    byId('toggle-items').click();
    document.querySelectorAll<HTMLElement>('#placement-list .placement-item')[1].click();
    expectClosed('placement-area', 'toggle-items');
    expect(byId('details-panel').classList.contains('hidden')).toBe(false);
  });

  test('a change of segment closes the open overlay; the Presentation segment offers the visibility list', async () => {
    await mountNarrow();
    byId('toggle-items').click();
    byId('tab-presentation').click();
    expectClosed('placement-area', 'toggle-items');
    expect([...byId('presentation-toggles').querySelectorAll('button')].map((b) => [b.textContent, b.getAttribute('aria-controls')])).toEqual([
      ['Visibility', 'visibility-area'],
    ]);
    byId('toggle-visibility').click();
    expectOpen('visibility-area', 'toggle-visibility');
    byId('toggle-glance').click();
    expectOpen('presentation-glance', 'toggle-glance');
    expectClosed('visibility-area', 'toggle-visibility');
  });

  test('the toggles speak the interface language', async () => {
    await mountNarrow();
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect([byId('map-toggles').getAttribute('aria-label'), ...[...byId('map-toggles').querySelectorAll('button')].map((b) => b.textContent)]).toEqual([
      'Paneler',
      'Poster',
      'I vyn',
      'Teckenförklaring',
    ]);
    expect(byId('toggle-visibility').textContent).toBe('Synlighet');
  });
});

describe('tap-to-place (FR-73)', () => {
  const placeAction = () => document.querySelector<HTMLButtonElement>('#placement-list .placement-item[data-placed="false"] .placement-place')!;
  const placed = () => document.querySelectorAll('#marker-layer .marker').length;

  test('an unplaced item offers the action, named for assistive technology; a placed one does not', async () => {
    await mountNarrow();
    const actions = [...document.querySelectorAll<HTMLButtonElement>('#placement-list .placement-place')];
    expect(actions.map((a) => [a.textContent, a.getAttribute('aria-label')])).toEqual([
      ['Place on map', 'Place on map: A-02'],
      ['Place on map', 'Place on map: A-04'],
      ['Place on map', 'Place on map: A-05'],
    ]);
    expect(document.querySelectorAll('#placement-list .placement-item[data-placed="true"] .placement-place')).toHaveLength(0);
    expect(byId('placement-hint').textContent).toBe('Choose Place on map, then tap the map where the item goes.');
  });

  test('after the action the list closes and a hint names the item; a tap on the stage places the marker at that point', async () => {
    const app = await mountNarrow();
    byId('toggle-items').click();
    placeAction().click();
    expect(byId('placement-area').dataset.state).toBe('closed');
    expect(byId('place-banner').classList.contains('hidden')).toBe(false);
    expect(byId('place-banner-text').textContent).toBe('Tap the map where A-02 goes.');
    expect(placed()).toBe(2);
    const stage = byId('map-stage');
    pointer('pointerdown', stage, STAGE.left + 200, STAGE.top + 150, { isPrimary: true });
    pointer('pointerup', stage, STAGE.left + 202, STAGE.top + 151, { isPrimary: true });
    expect(placed()).toBe(3);
    expect(byId('place-banner').classList.contains('hidden')).toBe(true);
    // The item's marker is in the work, through the drop's own placement.
    expect(app.captureWorkState().markers.map((m) => m.row)).toEqual([0, 1, 2]);
  });

  test('a pan is not a tap; Escape and Cancel end the waiting', async () => {
    await mountNarrow();
    placeAction().click();
    const stage = byId('map-stage');
    pointer('pointerdown', stage, STAGE.left + 200, STAGE.top + 150, { isPrimary: true });
    pointer('pointerup', stage, STAGE.left + 260, STAGE.top + 150, { isPrimary: true });
    expect(placed()).toBe(2);
    expect(byId('place-banner').classList.contains('hidden')).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(byId('place-banner').classList.contains('hidden')).toBe(true);
    placeAction().click();
    byId('place-cancel').click();
    expect(byId('place-banner').classList.contains('hidden')).toBe(true);
    pointer('pointerdown', stage, STAGE.left + 200, STAGE.top + 150, { isPrimary: true });
    pointer('pointerup', stage, STAGE.left + 200, STAGE.top + 150, { isPrimary: true });
    expect(placed()).toBe(2);
  });

  test('the action and the hint speak Swedish', async () => {
    await mountNarrow();
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(placeAction().textContent).toBe('Placera på kartan');
    expect(placeAction().getAttribute('aria-label')).toBe('Placera på kartan: A-02');
    expect(byId('placement-hint').textContent).toBe('Välj Placera på kartan och tryck sedan på kartan där posten ska stå.');
    placeAction().click();
    expect(byId('place-banner-text').textContent).toBe('Tryck på kartan där A-02 ska stå.');
    expect(byId('place-cancel').textContent).toBe('Avbryt');
  });
});

describe('the details panel as a bottom sheet (FR-74)', () => {
  test('a plain value is edited in a wrapping field that stays one line: Enter commits it, line breaks become spaces; a value with a list keeps its field', async () => {
    const app = await mountNarrow();
    byId('toggle-items').click();
    document.querySelectorAll<HTMLElement>('#placement-list .placement-item')[1].click();
    const field = (header: string) => byId('details-panel').querySelector<HTMLElement>(`.details-value[data-header="${header}"] .cell-input`)!;
    expect(field('Note').tagName).toBe('TEXTAREA');
    expect(field('Group').tagName).toBe('INPUT');
    const note = field('Note') as HTMLTextAreaElement;
    note.value = 'First line\nsecond line';
    note.dispatchEvent(new Event('input'));
    expect(note.value).toBe('First line second line');
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
    note.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    note.dispatchEvent(new Event('change'));
    expect(app.captureWorkState().rows[1].values.Note).toBe('First line second line');
  });

  test('opening an overlay closes the sheet, as it closes the card', async () => {
    await mountNarrow();
    byId('toggle-items').click();
    document.querySelectorAll<HTMLElement>('#placement-list .placement-item')[0].click();
    expect(byId('details-panel').classList.contains('hidden')).toBe(false);
    byId('toggle-map-legend').click();
    expect(byId('details-panel').classList.contains('hidden')).toBe(true);
  });

  test('above the threshold the details panel keeps its single-line fields', async () => {
    await mountApp();
    await placeExampleMarkers([[0, 60, 100]]);
    document.querySelectorAll<HTMLElement>('#placement-list .placement-item')[1].click();
    expect(byId('details-panel').querySelectorAll('textarea.cell-input')).toHaveLength(0);
  });
});

describe('the header collapsed into a menu (FR-71 as amended)', () => {
  const menuItems = () => [...byId('app-menu').children].map((c) => c.id || c.querySelector('select')!.id);

  test('the work controls, the settings, and the demo badge move into the Menu overlay, which behaves as the others', async () => {
    await mountNarrow();
    expect(menuItems()).toEqual(['demo-badge', 'demo-reset', 'work-controls', 'select-language', 'select-theme']);
    expect(byId('menu-toggle').textContent).toBe('Menu');
    expectClosed('app-menu', 'menu-toggle');
    byId('menu-toggle').focus();
    byId('menu-toggle').click();
    expectOpen('app-menu', 'menu-toggle');
    expect(document.activeElement).toBe(byId('app-menu'));
    // One open at a time.
    byId('toggle-items').click();
    expectClosed('app-menu', 'menu-toggle');
    byId('menu-toggle').click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expectClosed('app-menu', 'menu-toggle');
    expect(document.activeElement).toBe(byId('menu-toggle'));
  });

  test('opening the menu closes the details sheet; the Menu button carries the unsaved state', async () => {
    await mountNarrow();
    byId('toggle-items').click();
    document.querySelectorAll<HTMLElement>('#placement-list .placement-item')[0].click();
    expect(byId('details-panel').classList.contains('hidden')).toBe(false);
    byId('menu-toggle').click();
    expect(byId('details-panel').classList.contains('hidden')).toBe(true);
    expect(byId('menu-toggle').dataset.dirty).toBe('true');
    expect(byId('menu-toggle').getAttribute('aria-label')).toBe('Menu, unsaved changes');
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect([byId('menu-toggle').textContent, byId('menu-toggle').getAttribute('aria-label')]).toEqual(['Meny', 'Meny, osparade ändringar']);
  });

  test('above the threshold nothing is moved: the header keeps its controls where they were', async () => {
    await mountApp();
    await flush();
    expect(byId('app-menu').children).toHaveLength(0);
    expect(byId('work-controls').parentElement!.classList.contains('controls')).toBe(true);
    expect(byId('demo-reset').parentElement!.id).toBe('app-header');
    expect(byId('menu-toggle').hidden).toBe(true);
  });
});

describe('leaving the narrow layout (FR-71)', () => {
  test('the moved controls return to their places in the header, in their order', async () => {
    const listeners: Array<() => void> = [];
    const list = {
      matches: true,
      media: NARROW_QUERY,
      addEventListener: (_: string, l: () => void) => listeners.push(l),
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
    };
    await mountApp({
      beforeMain: () => {
        const plain = window.matchMedia.bind(window);
        window.matchMedia = ((q: string) => (q === NARROW_QUERY ? list : plain(q))) as typeof window.matchMedia;
      },
    });
    await flush();
    const order = () =>
      [...byId('app-header').querySelectorAll('#demo-badge, #demo-reset, #work-controls, #select-language, #select-theme')].map(
        (e) => `${e.id}<${e.closest('#app-menu') ? 'menu' : 'header'}`,
      );
    expect(order().every((o) => o.endsWith('menu'))).toBe(true);
    list.matches = false;
    for (const l of listeners) {
      l();
    }
    expect(order()).toEqual(['demo-badge<header', 'demo-reset<header', 'work-controls<header', 'select-language<header', 'select-theme<header']);
    expect(byId('work-controls').parentElement!.classList.contains('controls')).toBe(true);
    expect(byId('app-menu').children).toHaveLength(0);
  });
});

describe('the resize and orientation refit (FR-71, unit 6)', () => {
  function resizeStage(id: string, width: number, height: number): void {
    byId(id).getBoundingClientRect = () => ({
      left: STAGE.left,
      top: STAGE.top,
      width,
      height,
      x: STAGE.left,
      y: STAGE.top,
      right: STAGE.left + width,
      bottom: STAGE.top + height,
      toJSON: () => ({}),
    });
  }
  const transform = () => byId('map-content').style.transform;
  const scale = () => Number(/scale\(([\d.]+)\)/.exec(transform())![1]);

  test('in the narrow layout, a resize or a change of orientation refits a fitted map', async () => {
    await mountNarrow();
    byId('map-fit').click();
    for (const [event, size] of [
      ['orientationchange', [600, 300]],
      ['resize', [300, 600]],
    ] as const) {
      resizeStage('map-stage', size[0], size[1]);
      window.dispatchEvent(new Event(event));
      // The whole 1200 × 800 background in the new stage.
      expect(scale(), event).toBeCloseTo(Math.min(size[0] / 1200, size[1] / 800), 6);
    }
  });

  test('a stage resized while its segment was hidden is refitted when shown', async () => {
    await mountNarrow();
    byId('map-fit').click();
    byId('tab-presentation').click();
    resizeStage('map-stage', 300, 600);
    window.dispatchEvent(new Event('resize'));
    byId('tab-map').click();
    expect(scale()).toBeCloseTo(Math.min(300 / 1200, 600 / 800), 6);
  });

  test('above the threshold the handler is inert: a resize changes nothing', async () => {
    await mountApp();
    await placeExampleMarkers([[0, 60, 100]]);
    byId('map-fit').click();
    const before = transform();
    resizeStage('map-stage', 600, 300);
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('orientationchange'));
    expect(transform()).toBe(before);
  });
});
