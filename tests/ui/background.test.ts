import { beforeEach, describe, expect, test } from 'vitest';
import { byId, exampleFile, flush, loadExampleBackground, mountApp, pointer, STAGE, stubImageDecoding, stubStageLayout } from './harness';

function transform(): string {
  return byId('map-content').style.transform;
}

function scale(): number {
  return Number(byId('map-stage').dataset.scale);
}

describe('map background and viewport (FR-4)', () => {
  beforeEach(async () => {
    await mountApp();
    byId('tab-map').click();
  });

  test('before a background is loaded, the empty hint shows and view controls are disabled', () => {
    expect(byId('map-empty').classList.contains('hidden')).toBe(false);
    expect(byId('map-content').classList.contains('hidden')).toBe(true);
    for (const id of ['map-zoom-in', 'map-zoom-out', 'map-fit', 'map-reset']) {
      expect(byId<HTMLButtonElement>(id).disabled).toBe(true);
    }
  });

  test('the file picker loads an image and fits it to the stage', async () => {
    await loadExampleBackground();
    const img = byId<HTMLImageElement>('map-image');
    expect(img.src.startsWith('data:image/png;base64,')).toBe(true);
    expect(byId('map-stage').dataset.hasBackground).toBe('true');
    expect(byId('map-empty').classList.contains('hidden')).toBe(true);
    expect(byId('map-content').classList.contains('hidden')).toBe(false);
    // 1200x800 into 800x600: scale 2/3, centred vertically.
    expect(scale()).toBeCloseTo(2 / 3, 10);
    expect(transform()).toBe(`translate(0px, ${(600 - 800 * (2 / 3)) / 2}px) scale(${2 / 3})`);
    expect(byId('map-zoom-level').textContent).toBe('67%');
    expect(byId<HTMLButtonElement>('map-fit').disabled).toBe(false);
  });

  test('dropping an image file on the stage loads it as the background', async () => {
    stubStageLayout();
    stubImageDecoding(400, 300);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [exampleFile('example-background.png', 'image/png')], types: ['Files'], getData: () => '' },
    });
    byId('map-stage').dispatchEvent(drop);
    await flush();
    expect(byId('map-stage').dataset.hasBackground).toBe('true');
    expect(scale()).toBe(2);
  });

  test('a non-image file is rejected with a clear message', async () => {
    const input = byId<HTMLInputElement>('map-file-input');
    Object.defineProperty(input, 'files', { value: [exampleFile('example.xlsx', 'application/octet-stream')], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flush();
    expect(byId('map-error').classList.contains('hidden')).toBe(false);
    expect(byId('map-error').textContent).toMatch(/not supported/);
    expect(byId('map-stage').dataset.hasBackground).toBe('false');
  });

  test('an image that fails to decode is reported and leaves no background', async () => {
    stubStageLayout();
    stubImageDecoding(0, 0, true);
    const input = byId<HTMLInputElement>('map-file-input');
    Object.defineProperty(input, 'files', { value: [exampleFile('example-background.png', 'image/png')], configurable: true });
    input.dispatchEvent(new Event('change'));
    await flush();
    expect(byId('map-error').textContent).toMatch(/could not be read/);
    expect(byId('map-stage').dataset.hasBackground).toBe('false');
  });

  test('the zoom controls zoom about the stage centre', async () => {
    await loadExampleBackground();
    const before = scale();
    byId('map-zoom-in').click();
    expect(scale()).toBeCloseTo(before * 1.25, 10);
    byId('map-zoom-out').click();
    byId('map-zoom-out').click();
    expect(scale()).toBeCloseTo(before / 1.25, 10);
  });

  test('the wheel zooms about the cursor position', async () => {
    await loadExampleBackground();
    const before = scale();
    const wheel = new WheelEvent('wheel', { deltaY: -100, clientX: STAGE.left + 200, clientY: STAGE.top + 100, bubbles: true, cancelable: true });
    byId('map-stage').dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(scale()).toBeGreaterThan(before);
    byId('map-stage').dispatchEvent(new WheelEvent('wheel', { deltaY: 300, clientX: STAGE.left, clientY: STAGE.top, bubbles: true }));
    expect(scale()).toBeLessThan(before);
  });

  test('dragging the stage pans the view', async () => {
    await loadExampleBackground();
    const stage = byId('map-stage');
    const start = transform();
    pointer('pointerdown', stage, 300, 300);
    expect(stage.classList.contains('panning')).toBe(true);
    pointer('pointermove', stage, 340, 280);
    pointer('pointerup', stage, 340, 280);
    expect(stage.classList.contains('panning')).toBe(false);
    expect(transform()).not.toBe(start);
    expect(transform()).toBe(`translate(40px, ${(600 - 800 * (2 / 3)) / 2 - 20}px) scale(${2 / 3})`);
    pointer('pointermove', stage, 400, 400);
    expect(transform()).toBe(`translate(40px, ${(600 - 800 * (2 / 3)) / 2 - 20}px) scale(${2 / 3})`);
  });

  test('fit view and reset restore defined views', async () => {
    await loadExampleBackground();
    const fitted = transform();
    byId('map-zoom-in').click();
    pointer('pointerdown', byId('map-stage'), 0, 0);
    pointer('pointermove', byId('map-stage'), 50, 50);
    pointer('pointerup', byId('map-stage'), 50, 50);
    byId('map-fit').click();
    expect(transform()).toBe(fitted);
    byId('map-reset').click();
    expect(transform()).toBe('translate(-200px, -100px) scale(1)');
    expect(byId('map-zoom-level').textContent).toBe('100%');
  });

  test('the background and view survive a round trip through the other segments', async () => {
    await loadExampleBackground();
    byId('map-zoom-in').click();
    const view = transform();
    byId('tab-information').click();
    byId('tab-presentation').click();
    byId('tab-map').click();
    expect(transform()).toBe(view);
    expect(byId('map-stage').dataset.hasBackground).toBe('true');
  });
});
