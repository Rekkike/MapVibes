import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, markers, mountApp, placeExampleMarkers, pointer, setRole, STAGE, stubImageDecoding, stubStageLayout } from './harness';
import { readDataIsland } from '../../src/singlefile';
import { parseExport } from '../../src/exportfile';

// Editable symbol labels (FR-54): managed like the colour labels, carried by
// the legend, the pickers, the panels, the cards, and the exports. Since
// v2.6.0 (FR-54 as amended) a new work starts with the default vocabulary's
// five names, the other symbols start unnamed, and an unnamed symbol is
// shown, never explained: the legend and the card leave it out, and a
// picker names it by its own name as an identifier.

function input(symbol: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`#symbol-label-list input[data-symbol="${symbol}"]`)!;
}

function label(symbol: string, value: string): void {
  input(symbol).value = value;
  input(symbol).dispatchEvent(new Event('change'));
}

function legendShape(id: string, symbol: string): string | null {
  return byId(id).querySelector(`.legend-entry[data-shape="${symbol}"]:not([data-status])`)?.textContent ?? null;
}

const STARTER = { bolt: 'OPS quay', bulb: 'Idea phase', magnifier: 'Pre-study', gear: 'Engineering', 'hammer-shovel': 'Execution' };

describe('editable symbol labels (FR-54)', () => {
  let app: Awaited<ReturnType<typeof mountApp>>;

  beforeEach(async () => {
    app = await mountApp({ singleFile: true });
    await placeExampleMarkers([
      [0, 100, 100],
      [2, 400, 300],
    ]);
    byId('tab-information').click();
  });

  test('the panel offers every symbol: the five starter names, the other eight unnamed and unexplained', () => {
    expect(byId('symbol-panel-summary').textContent).toBe('Symbol labels');
    const inputs = [...document.querySelectorAll<HTMLInputElement>('#symbol-label-list input')];
    expect(inputs).toHaveLength(13);
    expect(Object.fromEntries(inputs.filter((i) => i.value !== '').map((i) => [i.dataset.symbol, i.value]))).toEqual(STARTER);
    expect(input('cross').value).toBe('');
    expect(input('cross').placeholder).toBe('No name');
    expect(input('bolt').getAttribute('aria-label')).toBe('Label for Lightning bolt');
    expect(legendShape('map-legend', 'bolt')).toBe('OPS quay');
    // No tautologies: no legend entry explains a symbol by its own name.
    expect(legendShape('map-legend', 'cross')).toBeNull();
    expect(legendShape('map-legend', 'circle')).toBeNull();
  });

  test("the user's label is carried by the legends, the pickers, and the details panel", () => {
    // A visible marker carries the labelled symbol, so the used-only
    // presentation legend shows it (FR-75).
    byId('tab-map').click();
    pointer('pointerdown', markers()[0], STAGE.left + 100, STAGE.top + 100);
    pointer('pointerup', markers()[0], STAGE.left + 100, STAGE.top + 100);
    const shape = byId<HTMLSelectElement>('marker-shape');
    shape.value = 'bolt';
    shape.dispatchEvent(new Event('change'));
    byId('tab-information').click();
    label('bolt', 'Urgent');
    expect(legendShape('map-legend', 'bolt')).toBe('Urgent');
    expect(legendShape('presentation-legend', 'bolt')).toBe('Urgent');
    // The status symbol picker.
    setRole('Note', 'status');
    byId<HTMLInputElement>('status-new').value = 'Open';
    byId('status-add').click();
    const statusPicker = document.querySelector<HTMLSelectElement>('#status-list .status-symbol')!;
    expect([...statusPicker.options].find((o) => o.value === 'bolt')!.textContent).toBe('Urgent (Lightning bolt)');
    expect([...statusPicker.options].find((o) => o.value === 'cross')!.textContent).toBe('Cross');
    // The marker picker and the details panel (the marker already carries bolt).
    byId('tab-map').click();
    pointer('pointerdown', markers()[0], STAGE.left + 100, STAGE.top + 100);
    pointer('pointerup', markers()[0], STAGE.left + 100, STAGE.top + 100);
    expect([...shape.options].find((o) => o.value === 'bolt')!.textContent).toBe('Urgent (Lightning bolt)');
    expect(shape.value).toBe('bolt');
    expect(byId('details-panel').querySelector('.details-symbol')!.textContent).toBe('Urgent');
  });

  test('a cleared label leaves the symbol unexplained, in either language', () => {
    label('square', 'Depot');
    expect(legendShape('map-legend', 'square')).toBe('Depot');
    label('square', '  ');
    expect(legendShape('map-legend', 'square')).toBeNull();
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(legendShape('map-legend', 'square')).toBeNull();
    expect(legendShape('map-legend', 'bolt')).toBe('OPS kaj');
    label('square', 'Depå');
    expect(legendShape('map-legend', 'square')).toBe('Depå');
    // A label is data: it does not change with the language.
    lang.value = 'en';
    lang.dispatchEvent(new Event('change'));
    expect(legendShape('map-legend', 'square')).toBe('Depå');
  });

  test('the labels are saved, exported, shown by the viewer, and used in the documents’ legend', async () => {
    // A placed marker carries bolt, so the exported viewer's used-only legend
    // shows the label (FR-75).
    byId('tab-map').click();
    pointer('pointerdown', markers()[0], STAGE.left + 100, STAGE.top + 100);
    pointer('pointerup', markers()[0], STAGE.left + 100, STAGE.top + 100);
    const shape = byId<HTMLSelectElement>('marker-shape');
    shape.value = 'bolt';
    shape.dispatchEvent(new Event('change'));
    byId('tab-information').click();
    label('bolt', 'Urgent');
    expect(app.captureWorkState().symbolLabels).toEqual({ ...STARTER, bolt: 'Urgent' });
    byId('tab-presentation').click();
    await flush();
    const island = readDataIsland(new DOMParser().parseFromString(app.exportPage()!, 'text/html'))!;
    expect(parseExport(island).workState.symbolLabels).toEqual({ ...STARTER, bolt: 'Urgent' });
    const scene = app.documentScene()!;
    expect(scene.legend.find((s) => s.kind === 'shapes')!.items.find((i) => i.symbol === 'bolt')!.label).toBe('Urgent');
    // The exported viewer.
    const doc = new DOMParser().parseFromString(app.exportPage()!, 'text/html');
    await mountApp({
      body: doc.body.innerHTML,
      beforeMain: () => {
        stubStageLayout();
        stubImageDecoding(1200, 800);
      },
    });
    await flush();
    expect(legendShape('presentation-legend', 'bolt')).toBe('Urgent');
  });
});
