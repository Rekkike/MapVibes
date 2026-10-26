import { beforeEach, describe, expect, test } from 'vitest';
import { addColumn, byId, columnKeyOf, editCell, flush, markers, mountApp, placeExampleMarkers, presentationMarkers, setRole } from './harness';

// The panel's structure: groups as "[name count: entries]", plain entries as
// their names.
function structure(prefix: 'map' | 'presentation'): string[] {
  return [...byId(`${prefix}-glance-list`).children].map((li) => {
    if (li.classList.contains('glance-group')) {
      const name = li.querySelector('.glance-group-name')!.textContent;
      const count = li.querySelector('.glance-group-count')!.textContent;
      const nested = [...li.querySelectorAll('.glance-group-list .glance-name')].map((n) => n.textContent);
      return `[${name} ${count}: ${nested.join(', ')}]`;
    }
    return li.querySelector('.glance-name')!.textContent ?? '';
  });
}

function toggle(prefix: 'map' | 'presentation', program: string): HTMLButtonElement {
  return byId(`${prefix}-glance-list`).querySelector<HTMLButtonElement>(`.glance-group[data-program="${program}"] .glance-group-toggle`)!;
}

function hover(node: Element, type: 'mouseenter' | 'mouseleave' | 'mouseover' | 'mouseout'): void {
  node.dispatchEvent(new MouseEvent(type, { bubbles: type.startsWith('mouseo') }));
}

describe('program groups at a glance (FR-44)', () => {
  beforeEach(async () => {
    await mountApp();
    await placeExampleMarkers([
      [0, 60, 100],
      [2, 400, 300],
      [3, 500, 350],
      [4, 760, 500],
    ]);
    byId('tab-information').click();
    setRole('ID', 'identifier');
    addColumn('Prog');
    editCell(0, 'Prog', 'P-East');
    editCell(2, 'Prog', 'P-West');
    editCell(3, 'Prog', 'P-East');
  });

  test('without the programme role, the entries stay plain', () => {
    byId('tab-map').click();
    expect(structure('map')).toEqual(['A-01', 'A-03', 'A-04', 'A-05']);
  });

  test('each programme is one group with its items in view nested; items without a programme stay plain', () => {
    setRole(columnKeyOf('Prog'), 'program');
    byId('tab-map').click();
    expect(structure('map')).toEqual(['[P-East 2: A-01, A-04]', '[P-West 1: A-03]', 'A-05']);
    expect(toggle('map', 'P-East').getAttribute('aria-expanded')).toBe('true');
    expect(toggle('map', 'P-East').getAttribute('aria-label')).toBe('Collapse the programme: P-East');
    expect(byId('map-glance-heading').querySelector('.glance-count')!.textContent).toBe('4');
  });

  test('a collapsed programme shows alone; expanding restores its items', () => {
    setRole(columnKeyOf('Prog'), 'program');
    byId('tab-map').click();
    toggle('map', 'P-East').click();
    expect(structure('map')).toEqual(['[P-East 2: ]', '[P-West 1: A-03]', 'A-05']);
    expect(toggle('map', 'P-East').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(toggle('map', 'P-East'));
    toggle('map', 'P-East').click();
    expect(structure('map')[0]).toBe('[P-East 2: A-01, A-04]');
  });

  test('the groups follow the view: only items in view are nested', () => {
    setRole(columnKeyOf('Prog'), 'program');
    byId('tab-map').click();
    byId('map-zoom-in').click();
    byId('map-zoom-in').click();
    byId('map-zoom-in').click();
    // A group sits where its first item in view would be.
    expect(structure('map')).toEqual(['[P-West 1: A-03]', '[P-East 1: A-04]']);
  });

  test('selection and highlighting work within the groups', () => {
    setRole(columnKeyOf('Prog'), 'program');
    byId('tab-map').click();
    const nested = byId('map-glance-list').querySelectorAll<HTMLElement>('.glance-group[data-program="P-East"] .glance-entry')[1];
    hover(nested, 'mouseenter');
    expect(markers()[2].classList.contains('highlighted')).toBe(true);
    hover(nested, 'mouseleave');
    nested.click();
    expect(markers()[2].classList.contains('selected')).toBe(true);
    expect(byId('details-panel').querySelector('.details-title')!.textContent).toBe('A-04');
    // Collapsed, the group carries the selection and the highlight of its items.
    toggle('map', 'P-East').click();
    expect(toggle('map', 'P-East').dataset.selected).toBe('true');
    hover(markers()[0], 'mouseover');
    expect(toggle('map', 'P-East').classList.contains('highlighted')).toBe(true);
    hover(markers()[0], 'mouseout');
    expect(toggle('map', 'P-East').classList.contains('highlighted')).toBe(false);
  });

  test('the Presentation segment groups too, each panel keeping its own collapsed groups; an entry opens the card', async () => {
    setRole(columnKeyOf('Prog'), 'program');
    byId('tab-map').click();
    toggle('map', 'P-West').click();
    byId('tab-presentation').click();
    await flush();
    expect(structure('presentation')).toEqual(['[P-East 2: A-01, A-04]', '[P-West 1: A-03]', 'A-05']);
    byId('presentation-glance-list').querySelector<HTMLElement>('.glance-group[data-program="P-West"] .glance-entry')!.click();
    expect(byId('presentation-card').dataset.state).toBe('open');
    expect(presentationMarkers()[1].classList.contains('selected')).toBe(true);
    toggle('presentation', 'P-East').click();
    expect(structure('presentation')[0]).toBe('[P-East 2: ]');
    byId('tab-map').click();
    expect(structure('map')).toEqual(['[P-East 2: A-01, A-04]', '[P-West 1: ]', 'A-05']);
  });

  test('items switched off for the presentation are not in its groups', async () => {
    setRole(columnKeyOf('Prog'), 'program');
    byId('tab-presentation').click();
    await flush();
    document.querySelectorAll<HTMLInputElement>('.visibility-toggle')[0].click();
    expect(structure('presentation')).toEqual(['[P-West 1: A-03]', '[P-East 1: A-04]', 'A-05']);
  });

  test('the group controls follow the language', () => {
    setRole(columnKeyOf('Prog'), 'program');
    byId('tab-map').click();
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(toggle('map', 'P-East').getAttribute('aria-label')).toBe('Fäll ihop programmet: P-East');
  });
});
