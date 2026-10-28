import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  byId,
  exampleFile,
  flush,
  importExampleWorkbook,
  markers,
  mountApp,
  openWorkFile,
  placeExampleMarkers,
  pointer,
  presentationMarkers,
  STAGE,
  stubImageDecoding,
  stubStageLayout,
  textFile,
} from './harness';
import { parseExport } from '../../src/exportfile';
import { readDataIsland } from '../../src/singlefile';
import { serialiseWorkState } from '../../src/workstate';

vi.mock('../../src/osmrender', () => ({
  renderPlanToDataUrl: (plan: { width: number; height: number }) => `data:image/png;base64,T1NN${plan.width}x${plan.height}`,
}));

// Annotations in the details panel and the card (FR-48), in the work-state
// file (schema version 6, FR-13), and in the exported file (export format
// version 2, FR-40) and its viewer.

function at(type: string, x: number, y: number, target: Element = byId('map-stage')): void {
  pointer(type, target, STAGE.left + x, STAGE.top + y);
}

function tool(name: string): void {
  document.querySelector<HTMLButtonElement>(`#annotation-tools [data-tool="${name}"]`)!.click();
}

function drawRectangle(from: [number, number], to: [number, number]): void {
  tool('rectangle');
  at('pointerdown', ...from);
  at('pointermove', ...to);
  at('pointerup', ...to);
}

function drawLine(points: Array<[number, number]>): void {
  tool('line');
  for (const p of points) {
    at('pointerdown', ...p);
    at('pointerup', ...p);
  }
  // A press on the last vertex finishes the line.
  at('pointerdown', ...points[points.length - 1]);
  at('pointerup', ...points[points.length - 1]);
}

function linkTo(value: string): void {
  const select = byId<HTMLSelectElement>('annotation-link');
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

function labelSelected(text: string): void {
  const input = byId<HTMLInputElement>('annotation-label');
  input.value = text;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new Event('change'));
}

function shapes(id = 'map-annotations'): SVGGElement[] {
  return [...byId(id).querySelectorAll<SVGGElement>('g.annotation')];
}

function tap(marker: HTMLElement): void {
  const x = STAGE.left + parseFloat(marker.style.left);
  const y = STAGE.top + parseFloat(marker.style.top);
  pointer('pointerdown', marker, x, y);
  pointer('pointerup', marker, x, y);
}

function footprints(container: string): string[][] {
  return [...byId(container).querySelectorAll('.footprint')].map((li) => [
    li.querySelector('.footprint-name')!.textContent ?? '',
    li.querySelector('.footprint-area')?.textContent ?? '',
  ]);
}

// Markers for A-01 and A-03; a rectangle linked to A-01 as its footprint,
// labelled; a free line, switched off for the presentation; a free
// rectangle, shown.
async function annotated(options: { singleFile?: boolean } = {}) {
  const app = await mountApp(options);
  await placeExampleMarkers([
    [0, 60, 100],
    [2, 400, 300],
  ]);
  drawRectangle([100, 150], [300, 250]);
  linkTo(document.querySelectorAll<HTMLOptionElement>('#annotation-link option')[1].value);
  labelSelected('Site footprint');
  drawLine([
    [500, 100],
    [700, 150],
  ]);
  drawRectangle([600, 400], [700, 500]);
  byId('tab-presentation').click();
  await flush();
  // The first toggle is the line's.
  document.querySelectorAll<HTMLInputElement>('.annotation-toggle')[0].click();
  byId('tab-map').click();
  return app;
}

describe('footprints in the details panel and the card (FR-48)', () => {
  beforeEach(async () => {
    await annotated();
  });

  test('the details panel names the linked annotations of the item', () => {
    tap(markers()[0]);
    expect(byId('details-panel').querySelector('.details-footprints .details-subheading')!.textContent).toBe('Footprints');
    // A plain image has no known scale: no area is given.
    expect(footprints('details-panel')).toEqual([['Site footprint', '']]);
    tap(markers()[1]);
    expect(byId('details-panel').querySelector('.details-footprints')).toBeNull();
  });

  test('the presentation card names them too, after the fields', async () => {
    byId('tab-presentation').click();
    await flush();
    tap(presentationMarkers()[0]);
    const card = byId('presentation-card');
    expect(card.dataset.state).toBe('open');
    expect(footprints('presentation-card')).toEqual([['Site footprint', '']]);
    expect(card.lastElementChild!.classList.contains('card-footprints')).toBe(true);
    tap(presentationMarkers()[1]);
    expect(card.querySelector('.card-footprints')).toBeNull();
  });

  test('the panel follows the language and a change of label', () => {
    tap(markers()[0]);
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(byId('details-panel').querySelector('.details-footprints .details-subheading')!.textContent).toBe('Fotavtryck');
    tool('select');
    at('pointerdown', 200, 200);
    at('pointerup', 200, 200);
    labelSelected('Renamed');
    expect(footprints('details-panel')).toEqual([['Renamed', '']]);
  });
});

describe('footprint areas on a rendered background (FR-49)', () => {
  test('the details panel gives the area in true units', async () => {
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
    drawRectangle([100, 150], [300, 250]);
    linkTo(document.querySelectorAll<HTMLOptionElement>('#annotation-link option')[1].value);
    byId('tab-information').click();
    document.querySelectorAll<HTMLElement>('#row-table-body tr')[0].querySelector<HTMLElement>('.row-details')!.click();
    const [[name, area]] = footprints('details-panel');
    expect(name).toBe('Rectangle 1');
    expect(area).toMatch(/^[\d,.]+ (m²|ha|km²)$/);
  });
});

describe('annotations in the work-state file (schema version 6, FR-13)', () => {
  test('annotations, links, and visibility survive a save and open', async () => {
    const app = await annotated();
    const text = serialiseWorkState(app.captureWorkState(), new Date());
    const file = JSON.parse(text);
    expect(file.schemaVersion).toBe(7);
    expect(file.annotations.map((a: { kind: string; link: number | null; hidden: boolean; label: string }) => [a.kind, a.link, a.hidden, a.label])).toEqual([
      ['rectangle', 0, false, 'Site footprint'],
      ['line', null, true, ''],
      ['rectangle', null, false, ''],
    ]);
    // Opened afresh, the annotations come back as they were.
    const fresh = await mountApp();
    stubImageDecoding(1200, 800);
    openWorkFile(textFile('work.json', text));
    await flush();
    byId('tab-map').click();
    expect(shapes()).toHaveLength(3);
    expect(JSON.stringify(fresh.captureWorkState().annotations)).toBe(JSON.stringify(app.captureWorkState().annotations));
    byId('tab-presentation').click();
    await flush();
    expect(shapes('presentation-annotations')).toHaveLength(2);
    expect(document.querySelectorAll<HTMLInputElement>('.annotation-toggle')[0].checked).toBe(false);
    byId('tab-map').click();
    tap(markers()[0]);
    expect(footprints('details-panel')).toEqual([['Site footprint', '']]);
  });

  test('the colour labels, the program vocabulary, and the at-a-glance columns survive too', async () => {
    const app = await annotated();
    const colour = document.querySelector<HTMLInputElement>('#colour-label-list input[data-colour="red"]')!;
    colour.value = 'Late';
    colour.dispatchEvent(new Event('change'));
    const before = app.captureWorkState();
    expect(before.colourLabels).toEqual({ red: 'Late' });
    const text = serialiseWorkState(before, new Date());
    const fresh = await mountApp();
    stubImageDecoding(1200, 800);
    openWorkFile(textFile('work.json', text));
    await flush();
    const after = fresh.captureWorkState();
    expect([after.colourLabels, after.programValues, after.glanceColumns]).toEqual([before.colourLabels, before.programValues, before.glanceColumns]);
    expect([...byId('map-legend').querySelectorAll('.legend-entry[data-colour]')].map((e) => e.textContent)).toContain('Late');
  });
});

describe('annotations in the exported file (export format version 2, FR-40)', () => {
  function exported(app: Awaited<ReturnType<typeof mountApp>>) {
    const page = app.exportPage(new Date(2024, 7, 9, 10, 30))!;
    return { page, data: parseExport(readIsland(page)) };
  }

  test('the export holds the annotations the presentation shows, and the colour labels and columns', async () => {
    const app = await annotated({ singleFile: true });
    const colour = document.querySelector<HTMLInputElement>('#colour-label-list input[data-colour="green"]')!;
    colour.value = 'Settled';
    colour.dispatchEvent(new Event('change'));
    const { data } = exported(app);
    expect(JSON.parse(readIsland(app.exportPage(new Date())!)).exportVersion).toBe(2);
    // The switched-off free line is not exported.
    expect(data.workState.annotations.map((a) => [a.kind, a.link, a.hidden, a.label])).toEqual([
      ['rectangle', 0, false, 'Site footprint'],
      ['rectangle', null, false, ''],
    ]);
    expect(data.workState.colourLabels).toEqual({ green: 'Settled' });
    expect(data.workState.glanceColumns).toEqual(app.captureWorkState().glanceColumns);
  });

  test('a linked footprint follows its item: switched off, both are absent', async () => {
    const app = await annotated({ singleFile: true });
    byId('tab-presentation').click();
    await flush();
    // The first item toggle is A-01's.
    document.querySelectorAll<HTMLInputElement>('.visibility-toggle')[0].click();
    const { data } = exported(app);
    expect(data.workState.rows.map((r) => r.values.ID)).not.toContain('A-01');
    expect(data.workState.annotations.map((a) => [a.kind, a.link])).toEqual([['rectangle', null]]);
  });

  test('links are remapped to the rows of the export', async () => {
    const app = await mountApp({ singleFile: true });
    await placeExampleMarkers([
      [0, 60, 100],
      [2, 400, 300],
    ]);
    drawRectangle([350, 250], [450, 350]);
    // The fourth option is A-03, the third row.
    linkTo(document.querySelectorAll<HTMLOptionElement>('#annotation-link option')[3].value);
    byId('tab-presentation').click();
    await flush();
    document.querySelectorAll<HTMLInputElement>('.visibility-toggle')[0].click();
    const { data } = exported(app);
    const link = data.workState.annotations[0].link!;
    expect(data.workState.rows[link].values.ID).toBe('A-03');
  });

  test('the viewer renders the annotations view-only, with the footprint in the card', async () => {
    const app = await annotated({ singleFile: true });
    const { page } = exported(app);
    const doc = new DOMParser().parseFromString(page, 'text/html');
    await mountApp({
      body: doc.body.innerHTML,
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(1200, 800);
      },
    });
    await flush();
    expect(document.documentElement.dataset.mode).toBe('viewer');
    expect(shapes('presentation-annotations')).toHaveLength(2);
    expect(byId('presentation-annotation-labels').textContent).toContain('Site footprint');
    // No editing: no handles, no free toggles, no toolbar in view.
    expect(document.querySelectorAll('.annotation-toggle')).toHaveLength(0);
    expect(byId('segment-map').classList.contains('hidden')).toBe(true);
    tap(presentationMarkers()[0]);
    expect(footprints('presentation-card')).toEqual([['Site footprint', '']]);
  });
});

function readIsland(page: string): string {
  return readDataIsland(new DOMParser().parseFromString(page, 'text/html'))!;
}
