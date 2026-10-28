import { describe, expect, test } from 'vitest';
import { byId, flush, mountApp, placeExampleMarkers, stubImageDecoding, stubStageLayout } from './harness';
import { parseExport } from '../../src/exportfile';
import { readDataIsland } from '../../src/singlefile';

// The exported viewer restores the view the file carries (FR-38 as amended
// in v1.3.0): the position and zoom of the presentation at export.

async function viewer(page: string): Promise<void> {
  const doc = new DOMParser().parseFromString(page, 'text/html');
  await mountApp({
    body: doc.body.innerHTML,
    beforeMain: () => {
      stubStageLayout();
      stubImageDecoding(1200, 800);
    },
  });
  await flush();
  await flush();
}

describe('the exported view is restored (FR-38)', () => {
  test('the viewer opens at the exported position and zoom, not fitted', async () => {
    const app = await mountApp({ singleFile: true });
    await placeExampleMarkers([[0, 100, 100]]);
    byId('tab-presentation').click();
    await flush();
    const fitted = byId('presentation-content').style.transform;
    byId('pres-zoom-in').click();
    byId('pres-zoom-in').click();
    const zoomed = byId('presentation-content').style.transform;
    expect(zoomed).not.toBe(fitted);
    const page = app.exportPage()!;
    const data = parseExport(readDataIsland(new DOMParser().parseFromString(page, 'text/html'))!);
    expect(data.stage).toEqual({ width: 800, height: 600 });
    await viewer(page);
    expect(document.documentElement.dataset.mode).toBe('viewer');
    expect(byId('presentation-content').style.transform).toBe(zoomed);
    // Fit view still fits.
    byId('pres-fit').click();
    expect(byId('presentation-content').style.transform).toBe(fitted);
  });

  test('a file without the stage size (exported before v1.3.0) still opens at its saved view', async () => {
    const app = await mountApp({ singleFile: true });
    await placeExampleMarkers([[0, 100, 100]]);
    byId('tab-presentation').click();
    await flush();
    byId('pres-zoom-in').click();
    const zoomed = byId('presentation-content').style.transform;
    const page = app.exportPage()!.replace(/,\s*"stage": \{\s*"width": 800,\s*"height": 600\s*\}/, '');
    expect(parseExport(readDataIsland(new DOMParser().parseFromString(page, 'text/html'))!).stage).toBeUndefined();
    await viewer(page);
    expect(byId('presentation-content').style.transform).toBe(zoomed);
  });
});
