import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  byId,
  exampleFile,
  flush,
  importExampleWorkbook,
  markers,
  mountApp,
  placeExampleMarkers,
  pointer,
  presentationMarkers,
  STAGE,
  stubImageDecoding,
  stubStageLayout,
} from './harness';

vi.mock('../../src/osmrender', () => ({
  renderPlanToDataUrl: (plan: { width: number; height: number }) => `data:image/png;base64,T1NN${plan.width}x${plan.height}`,
}));

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

function shapes(id = 'map-annotations'): SVGGElement[] {
  return [...byId(id).querySelectorAll<SVGGElement>('g.annotation')];
}

function rectX(g: SVGGElement): number {
  return Number(g.querySelector('rect')!.getAttribute('x'));
}

function linkTo(value: string): void {
  const select = byId<HTMLSelectElement>('annotation-link');
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

function dirty(): boolean {
  return !byId('work-dirty').classList.contains('hidden');
}

describe('annotation editing and linkage (FR-47, FR-48)', () => {
  beforeEach(async () => {
    await mountApp();
    // Markers for A-01 (at 60, 100) and A-03 (at 400, 300).
    await placeExampleMarkers([
      [0, 60, 100],
      [2, 400, 300],
    ]);
    drawRectangle([100, 150], [300, 250]);
  });

  test('a drawn annotation is selected, with its inspector: label, footprint link, area, deletion', () => {
    expect(byId('annotation-inspector').classList.contains('hidden')).toBe(false);
    expect(byId('annotation-inspector-heading').textContent).toBe('Rectangle 1');
    expect([...byId<HTMLSelectElement>('annotation-link').options].map((o) => o.textContent)).toEqual([
      'No item (a free annotation)',
      '1. A-01',
      '2. A-02',
      '3. A-03',
      '4. A-04',
      '5. A-05',
    ]);
    expect(byId('annotation-delete').textContent).toBe('Delete annotation');
    // On a plain image no unit is honest.
    expect(byId('annotation-area').textContent).toBe('No area in true units: the background has no known scale.');
    expect(byId('map-annotation-handles').querySelectorAll('.annotation-handle')).toHaveLength(2);
  });

  test('Select: a press on an annotation selects it without panning; a press elsewhere deselects and pans', () => {
    at('pointerdown', 700, 500);
    at('pointerup', 700, 500);
    expect(byId('annotation-inspector').classList.contains('hidden')).toBe(true);
    const before = byId('map-content').style.transform;
    at('pointerdown', 200, 200);
    at('pointerup', 200, 200);
    expect(byId('annotation-inspector').classList.contains('hidden')).toBe(false);
    expect(byId('map-content').style.transform).toBe(before);
    drag([700, 500], [720, 520]);
    expect(byId('map-content').style.transform).not.toBe(before);
  });

  test('dragging an annotation moves it as an unsaved change', async () => {
    const { stubSaveDialog, removeSaveDialog } = await import('./harness');
    stubSaveDialog();
    byId('work-save').click();
    await flush();
    removeSaveDialog();
    const x = rectX(shapes()[0]);
    drag([200, 200], [260, 200]);
    expect(rectX(shapes()[0])).toBeCloseTo(x + 60 / SCALE, 6);
    expect(dirty()).toBe(true);
  });

  test('a vertex handle reshapes the annotation', () => {
    const handle = byId('map-annotation-handles').querySelectorAll<HTMLElement>('.annotation-handle')[1];
    const width = Number(shapes()[0].querySelector('rect')!.getAttribute('width'));
    drag([300, 250], [350, 250], handle);
    expect(Number(shapes()[0].querySelector('rect')!.getAttribute('width'))).toBeCloseTo(width + 50 / SCALE, 6);
  });

  test('a label is shown at the annotation on both stages', async () => {
    const label = byId<HTMLInputElement>('annotation-label');
    label.value = 'Zone of works';
    label.dispatchEvent(new Event('input'));
    expect(byId('map-annotation-labels').textContent).toBe('Zone of works');
    expect(byId('annotation-inspector-heading').textContent).toBe('Zone of works');
    byId('tab-presentation').click();
    await flush();
    expect(byId('presentation-annotation-labels').textContent).toBe('Zone of works');
  });

  test('the style controls restyle the selected annotation', () => {
    const colour = byId<HTMLSelectElement>('annotation-colour');
    expect(colour.value).toBe('blue');
    colour.value = 'yellow';
    colour.dispatchEvent(new Event('change'));
    expect(shapes()[0].getAttribute('class')).toContain('colour-yellow');
  });

  test('deletion: by the button, and by the Delete key', () => {
    byId('annotation-delete').click();
    expect(shapes()).toHaveLength(0);
    expect(byId('annotation-inspector').classList.contains('hidden')).toBe(true);
    drawRectangle([100, 150], [300, 250]);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(shapes()).toHaveLength(0);
  });

  test('a footprint highlights with its item and follows its visibility everywhere', async () => {
    linkTo(markers()[0].dataset.rowId!);
    expect(dirty()).toBe(true);
    // Selecting the item highlights its footprint.
    pointer('pointerdown', markers()[0], STAGE.left + 60, STAGE.top + 100);
    pointer('pointerup', markers()[0], STAGE.left + 60, STAGE.top + 100);
    expect(shapes()[0].getAttribute('class')).toContain('highlighted');
    // Switched off for the presentation, the item takes its footprint along.
    byId('tab-presentation').click();
    await flush();
    expect(shapes('presentation-annotations')).toHaveLength(1);
    const x = STAGE.left + parseFloat(presentationMarkers()[0].style.left);
    const y = STAGE.top + parseFloat(presentationMarkers()[0].style.top);
    pointer('pointerdown', presentationMarkers()[0], x, y);
    pointer('pointerup', presentationMarkers()[0], x, y);
    expect(shapes('presentation-annotations')[0].getAttribute('class')).toContain('highlighted');
    document.querySelectorAll<HTMLInputElement>('.visibility-toggle')[0].click();
    expect(shapes('presentation-annotations')).toHaveLength(0);
    // A footprint has no toggle of its own.
    expect(document.querySelectorAll('.annotation-toggle')).toHaveLength(0);
    byId('tab-map').click();
    expect(shapes()[0].getAttribute('class')).toContain('faded');
  });

  test('a footprint whose item is removed from the list is absent from the presentation', async () => {
    linkTo(markers()[0].dataset.rowId!);
    byId('tab-information').click();
    document.querySelectorAll<HTMLElement>('#row-table-body tr')[0].querySelector<HTMLInputElement>('.row-select')!.click();
    byId('delete-selected').click();
    byId('tab-presentation').click();
    await flush();
    expect(shapes('presentation-annotations')).toHaveLength(0);
  });

  test('a free annotation has its own toggle beside the presentation stage', async () => {
    byId('tab-presentation').click();
    await flush();
    expect(byId('annotation-visibility-heading').textContent).toBe('Annotations');
    const toggle = document.querySelector<HTMLInputElement>('.annotation-toggle')!;
    expect(toggle.getAttribute('aria-label')).toBe('Shown in the presentation: Rectangle 1');
    expect(toggle.checked).toBe(true);
    toggle.click();
    expect(shapes('presentation-annotations')).toHaveLength(0);
    byId('tab-map').click();
    expect(shapes()[0].getAttribute('class')).toContain('faded');
  });

  test('the inspector follows the language', () => {
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(byId('annotation-inspector-heading').textContent).toBe('Rektangel 1');
    expect(byId('annotation-link-text').textContent).toBe('Fotavtryck för');
    expect(byId('annotation-area').textContent).toBe('Ingen area i verkliga enheter: bakgrunden har ingen känd skala.');
  });
});

describe('honest area measurement in the inspector (FR-49)', () => {
  test('on a background rendered from OpenStreetMap data the area is shown in true units', async () => {
    await mountApp({
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(3000, 2000);
      },
    });
    await importExampleWorkbook();
    byId('tab-map').click();
    const input = byId<HTMLInputElement>('map-file-input');
    Object.defineProperty(input, 'files', { value: [exampleFile('example-map.osm', '')], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flush();
    expect(byId('map-stage').dataset.hasBackground).toBe('true');
    drawRectangle([100, 150], [300, 250]);
    expect(byId('annotation-area').textContent).toMatch(/^Area: [\d,.]+ (m²|ha|km²)$/);
    tool('line');
    at('pointerdown', 100, 100);
    at('pointerup', 100, 100);
    at('pointerdown', 300, 100);
    at('pointerup', 300, 100);
    at('pointerdown', 300, 100);
    at('pointerup', 300, 100);
    // A line has no area.
    expect(byId('annotation-area').textContent).toBe('');
  });
});
