import { beforeEach, describe, expect, test } from 'vitest';
import { byId, flush, markers, mountApp, placeExampleMarkers, pointer, setRole, STAGE, stubImageDecoding, stubStageLayout } from './harness';
import { readDataIsland } from '../../src/singlefile';
import { parseExport } from '../../src/exportfile';

// Editable symbol labels (FR-54): managed like the colour labels, carried by
// the legend, the pickers, the panels, the cards, and the exports.

function input(symbol: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(`#symbol-label-list input[data-symbol="${symbol}"]`)!;
}

function label(symbol: string, value: string): void {
  input(symbol).value = value;
  input(symbol).dispatchEvent(new Event('change'));
}

function legendShape(id: string, symbol: string): string {
  return byId(id).querySelector(`.legend-entry[data-shape="${symbol}"]:not([data-status])`)!.textContent ?? '';
}

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

  test('the panel offers every symbol, each named by its own name until the user names it', () => {
    expect(byId('symbol-panel-summary').textContent).toBe('Symbol labels');
    const inputs = [...document.querySelectorAll<HTMLInputElement>('#symbol-label-list input')];
    expect(inputs).toHaveLength(13);
    expect(inputs.every((i) => i.value === '')).toBe(true);
    expect(input('bolt').placeholder).toBe('Lightning bolt');
    expect(input('bolt').getAttribute('aria-label')).toBe('Label for Lightning bolt');
    expect(legendShape('map-legend', 'bolt')).toBe('Lightning bolt');
  });

  test("the user's label is carried by the legends, the pickers, and the details panel", () => {
    label('bolt', 'Urgent');
    expect(legendShape('map-legend', 'bolt')).toBe('Urgent');
    expect(legendShape('presentation-legend', 'bolt')).toBe('Urgent');
    // The status symbol picker.
    setRole('Note', 'status');
    byId<HTMLInputElement>('status-new').value = 'Open';
    byId('status-add').click();
    const statusPicker = document.querySelector<HTMLSelectElement>('#status-list .status-symbol')!;
    expect([...statusPicker.options].find((o) => o.value === 'bolt')!.textContent).toBe('Urgent');
    // The marker picker and the details panel.
    byId('tab-map').click();
    pointer('pointerdown', markers()[0], STAGE.left + 100, STAGE.top + 100);
    pointer('pointerup', markers()[0], STAGE.left + 100, STAGE.top + 100);
    const shape = byId<HTMLSelectElement>('marker-shape');
    expect([...shape.options].find((o) => o.value === 'bolt')!.textContent).toBe('Urgent');
    shape.value = 'bolt';
    shape.dispatchEvent(new Event('change'));
    expect(byId('details-panel').querySelector('.details-symbol')!.textContent).toBe('Urgent');
  });

  test('a cleared label returns to the symbol’s own name, in either language', () => {
    label('square', 'Depot');
    label('square', '  ');
    expect(legendShape('map-legend', 'square')).toBe('Square');
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(legendShape('map-legend', 'square')).toBe('Kvadrat');
    label('square', 'Depå');
    expect(legendShape('map-legend', 'square')).toBe('Depå');
    // A label is data: it does not change with the language.
    lang.value = 'en';
    lang.dispatchEvent(new Event('change'));
    expect(legendShape('map-legend', 'square')).toBe('Depå');
  });

  test('the labels are saved, exported, shown by the viewer, and used in the documents’ legend', async () => {
    label('bolt', 'Urgent');
    expect(app.captureWorkState().symbolLabels).toEqual({ bolt: 'Urgent' });
    byId('tab-presentation').click();
    await flush();
    const island = readDataIsland(new DOMParser().parseFromString(app.exportPage()!, 'text/html'))!;
    expect(parseExport(island).workState.symbolLabels).toEqual({ bolt: 'Urgent' });
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
