import { beforeEach, describe, expect, test } from 'vitest';
import {
  byId,
  flush,
  markers,
  mountApp,
  placeExampleMarkers,
  pointer,
  presentationMarkers,
  setRole,
  STAGE,
  stubImageDecoding,
  stubStageLayout,
} from './harness';
import { readDataIsland } from '../../src/singlefile';
import { parseExport } from '../../src/exportfile';
import { ICON_PATHS, ICONS } from '../../src/symbols';

// The per-item accent (FR-82, v2.6.0): one accent symbol per item, alongside
// its number and its status, set and unset in the application's own editing
// surfaces (the card and the Map segment's marker options), drawn beside the
// number wherever the item's designation is drawn, carried by the work state
// (schema 13) and every export, named in the legend by its label, in both
// languages. The application gives it no meaning.

function cardAccent(): HTMLSelectElement {
  return document.querySelector<HTMLSelectElement>('#details-panel .details-accent select')!;
}

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

function selectMarker(index: number, x: number, y: number): void {
  pointer('pointerdown', markers()[index], STAGE.left + x, STAGE.top + y);
  pointer('pointerup', markers()[index], STAGE.left + x, STAGE.top + y);
}

function accentOf(node: Element | null): string | null {
  return node?.querySelector<HTMLElement>(':scope > .marker-accent')?.dataset.accent ?? null;
}

function legendShapes(id: string): string[] {
  return [...byId(id).querySelectorAll<HTMLElement>('.legend-entry[data-shape]:not([data-status])')].map((e) => `${e.dataset.shape}=${e.textContent}`);
}

describe('the per-item accent (FR-82)', () => {
  let app: Awaited<ReturnType<typeof mountApp>>;

  beforeEach(async () => {
    app = await mountApp({ singleFile: true });
    await placeExampleMarkers([
      [0, 100, 100],
      [2, 400, 300],
    ]);
    // A status line drives the first marker's symbol: the accent sits beside
    // the number and the status, never in their place.
    byId('tab-information').click();
    setRole('Note', 'status');
    byId<HTMLInputElement>('status-new').value = 'Open';
    byId('status-add').click();
    const symbol = document.querySelector<HTMLSelectElement>('#status-list .status-symbol')!;
    choose(symbol, 'gear');
    const toggle = byId<HTMLInputElement>('symbols-from-status');
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    const status = document.querySelector<HTMLSelectElement>('#row-table-body tr .status-select')!;
    choose(status, 'Open');
    byId('tab-map').click();
  });

  test('the card offers no accent or one of the eight icons; none by default', () => {
    selectMarker(0, 100, 100);
    const select = cardAccent();
    expect(select.getAttribute('aria-label')).toBe('Accent symbol, No. 1');
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ['', 'No accent'],
      ['bulb', 'Idea phase (Light bulb)'],
      ['magnifier', 'Pre-study (Magnifying glass)'],
      ['gear', 'Engineering (Gear)'],
      ['pause', 'Pause'],
      ['cross', 'Cross'],
      ['check', 'Checkmark'],
      ['hammer-shovel', 'Execution (Hammer and shovel)'],
      ['bolt', 'OPS quay (Lightning bolt)'],
    ]);
    expect(select.value).toBe('');
    expect(accentOf(markers()[0])).toBeNull();
  });

  test('set on the card, it is drawn beside the number and the status wherever the item lives, and unset everywhere', async () => {
    selectMarker(0, 100, 100);
    choose(cardAccent(), 'bolt');
    // The marker: the status's symbol, the number, and the accent together.
    const marker = markers()[0];
    expect(marker.dataset.shape).toBe('gear');
    expect(marker.querySelector(':scope > svg.marker-glyph path')!.getAttribute('d')).toBe(ICON_PATHS.gear);
    expect(marker.textContent).toBe('1');
    expect(accentOf(marker)).toBe('bolt');
    expect(marker.querySelector('.marker-accent path')!.getAttribute('d')).toBe(ICON_PATHS.bolt);
    expect(marker.dataset.accent).toBe('bolt');
    // The card's badge, the Map segment's items list, the "In view" list.
    expect(accentOf(document.querySelector('#details-panel .details-badge'))).toBe('bolt');
    expect(accentOf(document.querySelector('#placement-list .placement-item[data-row-id] .marker-badge'))).toBe('bolt');
    expect(accentOf(document.querySelector('#map-glance-list .glance-entry .marker-badge'))).toBe('bolt');
    // Only that item carries it.
    expect(accentOf(markers()[1])).toBeNull();
    // The Information list: beside the number, named for assistive technology.
    byId('tab-information').click();
    const glyph = document.querySelector<HTMLElement>('#row-table-body tr:first-child td.num .list-accent')!;
    expect(glyph.dataset.accent).toBe('bolt');
    expect(glyph.getAttribute('aria-label')).toBe('OPS quay');
    expect(document.querySelectorAll('#row-table-body .list-accent')).toHaveLength(1);
    // The presentation: the stage's marker and the used-only legend, which
    // names the accent by its label; the status's gear is the statuses line's.
    byId('tab-presentation').click();
    await flush();
    expect(accentOf(presentationMarkers()[0])).toBe('bolt');
    expect(legendShapes('presentation-legend')).toEqual(['bolt=OPS quay']);
    // Unset: gone from every surface.
    byId('tab-map').click();
    selectMarker(0, 100, 100);
    choose(cardAccent(), '');
    expect(accentOf(markers()[0])).toBeNull();
    expect(markers()[0].dataset.accent).toBeUndefined();
    expect(document.querySelectorAll('.marker-accent')).toHaveLength(0);
    byId('tab-presentation').click();
    await flush();
    expect(legendShapes('presentation-legend')).toEqual([]);
  });

  test("the Map segment's marker options set it too, only for a selected marker; the item's colour, symbol, and status are untouched", () => {
    // With no marker selected the control is disabled.
    pointer('pointerdown', byId('map-stage'), STAGE.left + 10, STAGE.top + 10);
    pointer('pointerup', byId('map-stage'), STAGE.left + 10, STAGE.top + 10);
    const select = byId<HTMLSelectElement>('marker-accent');
    expect(select.disabled).toBe(true);
    expect(byId('marker-accent-text').textContent).toBe('Accent symbol');
    selectMarker(1, 400, 300);
    expect(select.disabled).toBe(false);
    expect(select.options).toHaveLength(ICONS.length + 1);
    const before = { colour: markers()[1].dataset.colour, shape: markers()[1].dataset.shape };
    choose(select, 'check');
    expect(accentOf(markers()[1])).toBe('check');
    expect({ colour: markers()[1].dataset.colour, shape: markers()[1].dataset.shape }).toEqual(before);
    expect(cardAccent().value).toBe('check');
    expect(app.captureWorkState().rows[2].accent).toBe('check');
    // The application gives it no meaning: an unnamed accent is shown, never
    // explained (FR-54 as amended).
    expect(byId('details-panel').querySelector('.details-accent-name')).toBeNull();
    expect(legendShapes('map-legend').some((e) => e.startsWith('check='))).toBe(false);
  });

  test('it is saved, exported, drawn by the viewer, named in its legend, and carried by the document scene', async () => {
    selectMarker(0, 100, 100);
    choose(cardAccent(), 'bolt');
    const ws = app.captureWorkState();
    expect(ws.rows.map((r) => r.accent ?? null)).toEqual([...[0, 1, 2, 3, 4].map((i) => (i === 0 ? 'bolt' : null))]);
    byId('tab-presentation').click();
    await flush();
    const scene = app.documentScene()!;
    expect(scene.markers.map((m) => m.accent ?? null)).toEqual(['bolt', null]);
    const island = readDataIsland(new DOMParser().parseFromString(app.exportPage()!, 'text/html'))!;
    const data = parseExport(island);
    expect((JSON.parse(island) as { workState: { schemaVersion: number } }).workState.schemaVersion).toBe(14);
    expect(data.workState.rows.filter((r) => r.accent !== undefined).map((r) => r.accent)).toEqual(['bolt']);
    const doc = new DOMParser().parseFromString(app.exportPage()!, 'text/html');
    await mountApp({
      body: doc.body.innerHTML,
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(1200, 800);
      },
    });
    await flush();
    expect(document.documentElement.dataset.mode).toBe('viewer');
    expect(accentOf(presentationMarkers()[0])).toBe('bolt');
    expect(legendShapes('presentation-legend')).toEqual(['bolt=OPS quay']);
  });

  test('both languages: the pickers and the legend follow the interface language; parity exact', async () => {
    selectMarker(0, 100, 100);
    choose(cardAccent(), 'bolt');
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    selectMarker(0, 100, 100);
    expect(cardAccent().getAttribute('aria-label')).toBe('Accentsymbol, Nr 1');
    expect([...cardAccent().options].slice(0, 2).map((o) => o.textContent)).toEqual(['Ingen accent', 'Idéfas (Glödlampa)']);
    expect(cardAccent().value).toBe('bolt');
    expect(byId('marker-accent-text').textContent).toBe('Accentsymbol');
    expect(byId('details-panel').querySelector('.details-accent dt')!.textContent).toBe('Accentsymbol');
    byId('tab-presentation').click();
    await flush();
    expect(legendShapes('presentation-legend')).toEqual(['bolt=OPS kaj']);
  });
});
