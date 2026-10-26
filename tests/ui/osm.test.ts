import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  byId,
  dragItemToStage,
  exampleFile,
  flush,
  importExampleWorkbook,
  markers,
  mountApp,
  placementItems,
  removeSaveDialog,
  setRole,
  STAGE,
  stubImageDecoding,
  stubSaveDialog,
  stubStageLayout,
} from './harness';

// jsdom has no canvas: the drawing step is replaced by a stand-in that
// records the render plan and returns a data URL naming its size. Parsing and
// planning are the real code.
const plans: Array<{ width: number; height: number; shapes: number }> = [];
vi.mock('../../src/osmrender', () => ({
  renderPlanToDataUrl: (plan: { width: number; height: number; shapes: unknown[] }) => {
    plans.push({ width: plan.width, height: plan.height, shapes: plan.shapes.length });
    return `data:image/png;base64,T1NN${plan.width}x${plan.height}`;
  },
}));

function pick(file: File): void {
  const input = byId<HTMLInputElement>('map-file-input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
}

function osmFile(name = 'example-map.osm'): File {
  return exampleFile(name, '');
}

function textOsm(name: string, text: string): File {
  return new File([text], name, { type: '' });
}

describe('OpenStreetMap file backgrounds (FR-31)', () => {
  beforeEach(async () => {
    plans.length = 0;
    await mountApp();
    byId('tab-map').click();
    stubStageLayout();
    stubImageDecoding(3000, 2000);
  });

  afterEach(() => {
    removeSaveDialog();
  });

  test('the picker offers .osm files, and the hint names them', () => {
    expect(byId<HTMLInputElement>('map-file-input').accept).toContain('.osm');
    expect(byId('map-empty-hint').textContent).toMatch(/OpenStreetMap \(\.osm\)/);
  });

  test('an .osm file loads by the picker, is parsed locally, and becomes the background on the same viewport', async () => {
    pick(osmFile());
    await flush();
    expect(plans).toEqual([{ width: 3000, height: 2000, shapes: 37 }]);
    expect(byId<HTMLImageElement>('map-image').getAttribute('src')).toBe('data:image/png;base64,T1NN3000x2000');
    expect(byId('map-stage').dataset.hasBackground).toBe('true');
    expect(Number(byId('map-stage').dataset.scale)).toBeCloseTo(800 / 3000, 10);
    byId('map-zoom-in').click();
    expect(Number(byId('map-stage').dataset.scale)).toBeCloseTo((800 / 3000) * 1.25, 10);
    expect(byId('map-error').classList.contains('hidden')).toBe(true);
  });

  test('an .osm file loads by drop', async () => {
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [osmFile()], types: ['Files'], getData: () => '' } });
    byId('map-stage').dispatchEvent(drop);
    await flush();
    expect(byId('map-stage').dataset.hasBackground).toBe('true');
  });

  test('a malformed file fails with a clear message and leaves the background unchanged', async () => {
    pick(osmFile('example-map-malformed.osm'));
    await flush();
    expect(byId('map-error').textContent).toBe('The OpenStreetMap file could not be read: it is not well-formed OpenStreetMap XML.');
    expect(byId('map-stage').dataset.hasBackground).toBe('false');
    expect(plans).toEqual([]);
  });

  test('a file without drawable features is reported', async () => {
    pick(textOsm('empty.osm', '<?xml version="1.0"?><osm version="0.6"></osm>'));
    await flush();
    expect(byId('map-error').textContent).toBe('The OpenStreetMap data contains no roads, buildings, water, or other features that can be drawn.');
  });

  test('a file above the size limit is refused before reading', async () => {
    const big = textOsm('big.osm', '<osm/>');
    Object.defineProperty(big, 'size', { value: 60 * 1024 * 1024 });
    pick(big);
    await flush();
    expect(byId('map-error').textContent).toBe('The OpenStreetMap file is larger than 50 MB. Choose a smaller area.');
  });

  test('markers are placed on the rendered background, and the background is embedded in the work state', async () => {
    byId('tab-information').click();
    await importExampleWorkbook();
    setRole('ID', 'identifier');
    byId('tab-map').click();
    pick(osmFile());
    await flush();
    dragItemToStage(placementItems()[0], STAGE.left + 400, STAGE.top + 250);
    expect(markers().map((m) => [m.textContent, m.style.left])).toEqual([['1', '400px']]);
    byId('map-reset').click();
    // Image coordinates: (400 - 0) / (800/3000) = 1500 at scale 1, offset (800-3000)/2 = -1100.
    expect(parseFloat(markers()[0].style.left)).toBeCloseTo(1500 - 1100, 6);
    const written = stubSaveDialog();
    byId('work-save').click();
    await flush();
    const file = JSON.parse(written.text!);
    // The rendering's projection is saved with it, so that its scale stays
    // known (FR-49).
    expect(file.background).toMatchObject({ dataUrl: 'data:image/png;base64,T1NN3000x2000', width: 3000, height: 2000 });
    expect(Object.keys(file.background.projection).sort()).toEqual(['scale', 'x0', 'y1']);
    expect(file.markers[0].x).toBeCloseTo(1500, 6);
  });

  test('the background reaches the presentation stage like any other background', async () => {
    pick(osmFile());
    await flush();
    byId('tab-presentation').click();
    await flush();
    expect(byId<HTMLImageElement>('presentation-image').getAttribute('src')).toBe('data:image/png;base64,T1NN3000x2000');
  });
});
