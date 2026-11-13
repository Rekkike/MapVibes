import { describe, expect, test } from 'vitest';
import { byId, flush, mountApp, placeExampleMarkers, stubImageDecoding, stubStageLayout } from './harness';
import { parseExport } from '../../src/exportfile';
import { readDataIsland } from '../../src/singlefile';

// The exported viewer opens fitted to its stage (FR-38 as amended in this
// pass, the refit on open): the position and zoom the file carries are not
// restored on opening; the view the file was exported with (map, timeline,
// costs) still is.

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

describe('the exported viewer opens fitted to its stage (FR-38 as amended)', () => {
  test('the viewer opens fitted, not at the exported zoom; Fit view still fits', async () => {
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
    // The refit on open: fitted to the stage the viewer opens on.
    expect(byId('presentation-content').style.transform).toBe(fitted);
    // Fit view still fits.
    byId('pres-fit').click();
    expect(byId('presentation-content').style.transform).toBe(fitted);
  });

  test('a file without the stage size (exported before v1.3.0) also opens fitted', async () => {
    const app = await mountApp({ singleFile: true });
    await placeExampleMarkers([[0, 100, 100]]);
    byId('tab-presentation').click();
    await flush();
    const fitted = byId('presentation-content').style.transform;
    byId('pres-zoom-in').click();
    const zoomed = byId('presentation-content').style.transform;
    expect(zoomed).not.toBe(fitted);
    const page = app.exportPage()!.replace(/,\s*"stage": \{\s*"width": 800,\s*"height": 600\s*\}/, '');
    expect(parseExport(readDataIsland(new DOMParser().parseFromString(page, 'text/html'))!).stage).toBeUndefined();
    await viewer(page);
    byId('pres-fit').click();
    const refitted = byId('presentation-content').style.transform;
    expect(refitted).not.toBe(zoomed);
    expect(refitted).toBe(fitted);
  });
});
