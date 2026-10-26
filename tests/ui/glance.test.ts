import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, markers, mountApp, placeExampleMarkers, pointer, presentationMarkers, setRole, STAGE } from './harness';

function entries(prefix: 'map' | 'presentation'): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`#${prefix}-glance-list .glance-entry`)];
}

function numbers(prefix: 'map' | 'presentation'): string[] {
  return entries(prefix).map((e) => e.querySelector('.marker-badge')!.textContent ?? '');
}

function hover(node: Element, type: 'mouseenter' | 'mouseleave' | 'mouseover' | 'mouseout'): void {
  node.dispatchEvent(new MouseEvent(type, { bubbles: type.startsWith('mouseo') }));
}

describe('at-a-glance panel (FR-28)', () => {
  beforeEach(async () => {
    await mountApp();
    // Stage points with the fitted view (scale 2/3): far left, centre, far right.
    await placeExampleMarkers([
      [0, 60, 100],
      [2, 400, 300],
      [4, 760, 500],
    ]);
    byId('tab-information').click();
    setRole('Group', 'area');
    byId('tab-map').click();
  });

  test('the panel beside the map lists the markers in view with number, name, colour, and area', () => {
    expect(byId('segment-map').contains(byId('map-glance'))).toBe(true);
    expect(numbers('map')).toEqual(['1', '3', '5']);
    const first = entries('map')[0];
    expect(first.querySelector('.marker-badge')!.className).toBe('marker-badge marker-green marker-shape-circle');
    expect(first.querySelector('.glance-name')!.textContent).toBe('A-01');
    expect(first.querySelector('.glance-area')!.textContent).toBe('North');
    // Row 5 has an empty area value: no area line is shown.
    expect(entries('map')[2].querySelector('.glance-area')).toBeNull();
    expect(byId('map-glance-heading').querySelector('.glance-count')!.textContent).toBe('3');
  });

  test('the panel updates live as the view moves', () => {
    byId('map-zoom-in').click();
    byId('map-zoom-in').click();
    byId('map-zoom-in').click();
    expect(numbers('map')).toEqual(['3']);
    pointer('pointerdown', byId('map-stage'), STAGE.left + 400, STAGE.top + 300);
    pointer('pointermove', byId('map-stage'), STAGE.left + 1200, STAGE.top + 300);
    pointer('pointerup', byId('map-stage'), STAGE.left + 1200, STAGE.top + 300);
    expect(numbers('map')).toEqual([]);
    expect(byId('map-glance-empty').classList.contains('hidden')).toBe(false);
    byId('map-fit').click();
    expect(numbers('map')).toEqual(['1', '3', '5']);
  });

  test('items switched off for the presentation are not listed', () => {
    byId('tab-presentation').click();
    document.querySelectorAll<HTMLInputElement>('.visibility-toggle')[1].click();
    expect(numbers('presentation')).toEqual(['1', '5']);
    byId('tab-map').click();
    expect(numbers('map')).toEqual(['1', '5']);
  });

  test('hovering an entry highlights its marker, and hovering a marker highlights its entry', () => {
    hover(entries('map')[1], 'mouseenter');
    expect(markers()[1].classList.contains('highlighted')).toBe(true);
    expect(markers()[0].classList.contains('highlighted')).toBe(false);
    hover(entries('map')[1], 'mouseleave');
    expect(markers()[1].classList.contains('highlighted')).toBe(false);
    hover(markers()[2], 'mouseover');
    expect(entries('map')[2].classList.contains('highlighted')).toBe(true);
    hover(markers()[2], 'mouseout');
    expect(entries('map')[2].classList.contains('highlighted')).toBe(false);
  });

  test('clicking an entry selects its marker, and selecting a marker marks its entry', () => {
    entries('map')[0].click();
    expect(markers()[0].classList.contains('selected')).toBe(true);
    expect(entries('map')[0].dataset.selected).toBe('true');
    pointer('pointerdown', markers()[2], STAGE.left + 760, STAGE.top + 500);
    pointer('pointerup', markers()[2], STAGE.left + 760, STAGE.top + 500);
    expect(entries('map')[2].dataset.selected).toBe('true');
    expect(entries('map')[0].dataset.selected).toBeUndefined();
  });

  test('the presentation stage has its own panel following its own view', async () => {
    byId('tab-presentation').click();
    await flush();
    expect(byId('segment-presentation').contains(byId('presentation-glance'))).toBe(true);
    expect(numbers('presentation')).toEqual(['1', '3', '5']);
    byId('pres-zoom-in').click();
    byId('pres-zoom-in').click();
    byId('pres-zoom-in').click();
    expect(numbers('presentation')).toEqual(['3']);
    byId('tab-map').click();
    expect(numbers('map')).toEqual(['1', '3', '5']);
  });

  test('in the Map segment a marker click selects without opening the presentation card', () => {
    pointer('pointerdown', markers()[0], STAGE.left + 60, STAGE.top + 100);
    pointer('pointerup', markers()[0], STAGE.left + 60, STAGE.top + 100);
    expect(byId('presentation-card').dataset.state).toBe('closed');
  });
});
