import { describe, expect, test } from 'vitest';
import { byId, flush, mountApp, placeExampleMarkers, pointer, STAGE } from './harness';
import { NARROW_QUERY } from '../../src/narrowviewer';

// The phone editor's phase two, unit 2 (FR-47 as amended in v1.15.0, FR-72):
// in the narrow layout the inspector of the selected annotation is a bottom
// sheet over the stage, so that selecting a shape never moves the stage; the
// four style controls move from the toolbar into the sheet; the sheet opens
// and closes in the overlays' pattern (data-state, inert, focus in and back,
// Escape, tap outside, Close); the handles are dragged as before, and the
// outline tolerance is 16 pixels on touch against 6 on a fine pointer. The
// layout itself (the stage's size unchanged under the sheet, the 28-pixel
// handles with 44-pixel hit areas) is measured in the browser suite. Above
// the threshold everything keeps its desktop behaviour.

const SCALE = 2 / 3;

function at(type: string, x: number, y: number, target: Element = byId('map-stage')): void {
  pointer(type, target, STAGE.left + x, STAGE.top + y);
}

function drag(from: [number, number], to: [number, number], target?: Element): void {
  at('pointerdown', ...from, target);
  at('pointermove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2);
  at('pointermove', ...to);
  at('pointerup', ...to);
}

function tool(name: string): void {
  document.querySelector<HTMLButtonElement>(`#annotation-tools [data-tool="${name}"]`)!.click();
}

function drawRectangle(from: [number, number], to: [number, number]): void {
  tool('rectangle');
  drag(from, to);
}

function shapes(): SVGGElement[] {
  return [...byId('map-annotations').querySelectorAll<SVGGElement>('g.annotation')];
}

const STYLE_CONTROLS = ['annotation-colour', 'annotation-fill', 'annotation-outline', 'annotation-line-style'];

// Mounts the application with the narrow query matching, with the example
// background and one rectangle drawn (and selected).
async function mountNarrowPhone(): Promise<void> {
  await mountApp({
    beforeMain: () => {
      const plain = window.matchMedia;
      window.matchMedia = ((q: string) => (q === NARROW_QUERY ? { ...plain(q), matches: true } : plain(q))) as typeof window.matchMedia;
    },
  });
  await placeExampleMarkers([
    [0, 60, 100],
    [2, 400, 300],
  ]);
  drawRectangle([100, 150], [300, 250]);
  await flush();
}

async function mountWidePhone(): Promise<void> {
  await mountApp();
  await placeExampleMarkers([
    [0, 60, 100],
    [2, 400, 300],
  ]);
  drawRectangle([100, 150], [300, 250]);
  await flush();
}

describe('the annotation inspector as a bottom sheet (FR-47 as amended in v1.15.0, FR-72)', () => {
  test('selecting a shape opens the sheet over the stage, with the four style controls in it and focus moved in', async () => {
    await mountNarrowPhone();
    const inspector = byId('annotation-inspector');
    expect(inspector.dataset.state).toBe('open');
    expect(inspector.inert).toBe(false);
    expect(inspector.classList.contains('hidden')).toBe(false);
    expect(document.activeElement).toBe(inspector);
    for (const id of STYLE_CONTROLS) expect(byId(id).closest('#annotation-inspector'), id).not.toBeNull();
    expect(byId('annotation-toolbar').querySelectorAll(':scope > label')).toHaveLength(0);
    // Selecting an annotation does not touch the details flow: the sheet
    // overlays the stage, the stage's own layout is not refit.
    expect(document.documentElement.dataset.details).toBe('closed');
    expect(byId('annotation-inspector-heading').textContent).toBe('Rectangle 1');
  });

  test('above the threshold the inspector stays in the flow and the style controls stay in the toolbar', async () => {
    await mountWidePhone();
    const inspector = byId('annotation-inspector');
    expect(inspector.classList.contains('hidden')).toBe(false);
    expect(inspector.dataset.state).toBeUndefined();
    expect(inspector.inert).toBe(false);
    for (const id of STYLE_CONTROLS) expect(byId(id).closest('#annotation-toolbar'), id).not.toBeNull();
  });

  test('focus returns on Escape; a re-tap on the shape reopens the sheet; a tap outside closes it; the Close button closes it', async () => {
    await mountNarrowPhone();
    at('pointerdown', 700, 500);
    at('pointerup', 700, 500);
    expect(byId('annotation-inspector').dataset.state).toBe('closed');
    expect(byId('annotation-inspector').inert).toBe(true);
    const selectButton = document.querySelector<HTMLButtonElement>('#annotation-tools [data-tool="select"]')!;
    selectButton.focus();
    at('pointerdown', 200, 200);
    at('pointerup', 200, 200);
    expect(byId('annotation-inspector').dataset.state).toBe('open');
    expect(document.activeElement).toBe(byId('annotation-inspector'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(byId('annotation-inspector').dataset.state).toBe('closed');
    expect(document.activeElement).toBe(selectButton);
    at('pointerdown', 200, 200);
    at('pointerup', 200, 200);
    expect(byId('annotation-inspector').dataset.state).toBe('open');
    pointer('pointerdown', byId('annotation-toolbar'), STAGE.left + 10, STAGE.top + 10);
    expect(byId('annotation-inspector').dataset.state).toBe('closed');
    at('pointerdown', 200, 200);
    at('pointerup', 200, 200);
    expect(byId('annotation-inspector').dataset.state).toBe('open');
    byId('annotation-inspector-close').click();
    expect(byId('annotation-inspector').dataset.state).toBe('closed');
    expect(shapes()).toHaveLength(1);
  });

  test('opening one of the segment overlays closes the sheet; the selection is gone with it', async () => {
    await mountNarrowPhone();
    expect(byId('annotation-inspector').dataset.state).toBe('open');
    byId('toggle-items').click();
    expect(byId('annotation-inspector').dataset.state).toBe('closed');
    expect(byId('annotation-inspector').inert).toBe(true);
    byId('toggle-items').click();
    at('pointerdown', 200, 200);
    at('pointerup', 200, 200);
    expect(byId('annotation-inspector').dataset.state).toBe('open');
  });

  test('a vertex handle is dragged in the narrow layout, reshaping the annotation', async () => {
    await mountNarrowPhone();
    const handle = byId('map-annotation-handles').querySelectorAll<HTMLElement>('.annotation-handle')[1];
    const width = Number(shapes()[0].querySelector('rect')!.getAttribute('width'));
    drag([300, 250], [350, 250], handle);
    expect(Number(shapes()[0].querySelector('rect')!.getAttribute('width'))).toBeCloseTo(width + 50 / SCALE, 6);
  });

  test('the whole shape is dragged in the narrow layout', async () => {
    await mountNarrowPhone();
    const x = Number(shapes()[0].querySelector('rect')!.getAttribute('x'));
    drag([200, 200], [260, 200]);
    expect(Number(shapes()[0].querySelector('rect')!.getAttribute('x'))).toBeCloseTo(x + 60 / SCALE, 6);
  });

  test('the style controls in the sheet restyle the selected annotation', async () => {
    await mountNarrowPhone();
    const colour = byId<HTMLSelectElement>('annotation-colour');
    expect(colour.value).toBe('blue');
    colour.value = 'yellow';
    colour.dispatchEvent(new Event('change'));
    expect(shapes()[0].getAttribute('class')).toContain('colour-yellow');
    expect(byId('annotation-inspector').dataset.state).toBe('open');
  });

  test('the outline tolerance: a press 12 pixels from the outline selects on touch, not with a fine pointer', async () => {
    await mountNarrowPhone();
    at('pointerdown', 312, 200);
    at('pointerup', 312, 200);
    expect(byId('annotation-inspector').dataset.state).toBe('open');
    await mountWidePhone();
    at('pointerdown', 312, 200);
    at('pointerup', 312, 200);
    expect(byId('annotation-inspector').classList.contains('hidden')).toBe(true);
  });
});
