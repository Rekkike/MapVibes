import { describe, expect, test } from 'vitest';
import {
  byId,
  flush,
  importExampleWorkbook,
  loadExampleBackground,
  mountApp,
  openWorkFile,
  placeExampleMarkers,
  pointer,
  setRole,
  STAGE,
  textFile,
} from './harness';
import { NARROW_QUERY } from '../../src/narrowviewer';

// The phone editor's phase two, unit 5 (FR-71 and FR-72 as amended in
// v1.15.0): the three stacked pages in the narrow layout -- export
// presentation, comparison, activities -- full-height over the stage, one
// open at a time, focus moved in and returned, Escape and tap outside
// closing, with a Close in the pinned header. Above the threshold nothing of
// the overlay remains. The layout is measured in the browser suite.

async function mountNarrow(): Promise<void> {
  await mountApp({
    beforeMain: () => {
      const plain = window.matchMedia.bind(window);
      window.matchMedia = (q: string) => (q === NARROW_QUERY ? { ...plain(q), matches: true } : plain(q));
    },
  });
}

async function mountNarrowWithWork(): Promise<void> {
  // singleFile, so that the export action can prepare its file (FR-11).
  await mountApp({
    singleFile: true,
    beforeMain: () => {
      const plain = window.matchMedia.bind(window);
      window.matchMedia = (q: string) => (q === NARROW_QUERY ? { ...plain(q), matches: true } : plain(q));
    },
  });
  await placeExampleMarkers([
    [0, 60, 100],
    [2, 400, 300],
  ]);
}

function esc(): void {
  (document.activeElement ?? window).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

const expectPageOpen = (id: string) => {
  expect(byId(id).classList.contains('hidden'), id).toBe(false);
  expect(byId(id).dataset.state, id).toBe('open');
  expect(byId(id).inert, id).toBe(false);
  expect(byId(id).contains(document.activeElement), id).toBe(true);
};

const expectPageClosed = (id: string) => {
  expect(byId(id).classList.contains('hidden'), id).toBe(true);
  expect(byId(id).dataset.state, id).toBe('closed');
  expect(byId(id).inert, id).toBe(true);
};

describe('the three stacked pages in the narrow layout (FR-71, FR-72 as amended in v1.15.0)', () => {
  test('export presentation: a page with a Close in its header; Escape, the header Close, and Cancel each close it', async () => {
    await mountNarrowWithWork();
    byId('tab-presentation').click();
    await flush();
    byId('export-open').focus();
    byId('export-open').click();
    expectPageOpen('export-panel');
    expect(document.activeElement).toBe(byId('export-go'));
    expect(byId('export-close').textContent).toBe('Close');
    expect(byId('export-close').closest('.dialog-head')).not.toBeNull();
    esc();
    expectPageClosed('export-panel');
    expect(document.activeElement).toBe(byId('export-open'));
    byId('export-open').click();
    expectPageOpen('export-panel');
    byId('export-close').click();
    expectPageClosed('export-panel');
    byId('export-open').click();
    expectPageOpen('export-panel');
    byId('export-cancel').click();
    expectPageClosed('export-panel');
  });

  test('comparison: a page; Escape and its Close close it', async () => {
    const exporter = await mountApp({ singleFile: true });
    await placeExampleMarkers([[0, 60, 100]]);
    const page = exporter.exportPage(new Date('2024-09-01T08:00:00Z'))!;
    await mountNarrow();
    await importExampleWorkbook();
    setRole('ID', 'identifier');
    byId('tab-map').click();
    await loadExampleBackground();
    openWorkFile(textFile('mapvibes-presentation.html', page));
    await flush();
    expectPageOpen('compare-panel');
    esc();
    expectPageClosed('compare-panel');
    openWorkFile(textFile('mapvibes-presentation.html', page));
    await flush();
    expectPageOpen('compare-panel');
    byId('compare-close').click();
    expectPageClosed('compare-panel');
  });

  test('activities: a page; Escape and its Close close it', async () => {
    await mountNarrow();
    await placeExampleMarkers([[0, 100, 100]]);
    document.querySelectorAll<HTMLElement>('#row-table-body tr')[0].querySelector<HTMLElement>('.row-details')!.click();
    await flush();
    const action = [...document.querySelectorAll<HTMLElement>('#details-panel .details-economics')].find((b) => b.textContent === 'Import activities')!;
    action.click();
    await flush();
    expectPageOpen('activity-panel');
    expect(document.activeElement).toBe(byId('activity-choose'));
    esc();
    expectPageClosed('activity-panel');
    document.querySelectorAll<HTMLElement>('#row-table-body tr')[0].querySelector<HTMLElement>('.row-details')!.click();
    await flush();
    [...document.querySelectorAll<HTMLElement>('#details-panel .details-economics')].find((b) => b.textContent === 'Import activities')!.click();
    await flush();
    expectPageOpen('activity-panel');
    byId('activity-close').click();
    expectPageClosed('activity-panel');
  });
});

describe('one dialog at a time, and the stage never moves under a dialog (FR-71, FR-72 as amended in v1.15.0)', () => {
  test('opening one dialog closes another; opening a toggle overlay closes an open dialog; opening a dialog closes the annotation sheet', async () => {
    await mountNarrowWithWork();
    byId('tab-presentation').click();
    await flush();
    byId('export-open').click();
    expectPageOpen('export-panel');
    byId('pdf-open').click();
    await flush();
    expectPageClosed('export-panel');
    expectPageOpen('document-panel');
    byId('tab-map').click();
    await flush();
    byId('fetch-open').click();
    expectPageOpen('fetch-panel');
    byId('toggle-items').click();
    expectPageClosed('fetch-panel');
    expect(byId('placement-area').dataset.state).toBe('open');
    byId('toggle-items').click();
    // An annotation selected, then a dialog opened: the inspector sheet closes.
    await mountNarrow();
    await placeExampleMarkers([[0, 60, 100]]);
    document.querySelector<HTMLButtonElement>('#annotation-tools [data-tool="rectangle"]')!.click();
    pointer('pointerdown', byId('map-stage'), STAGE.left + 100, STAGE.top + 100);
    pointer('pointermove', byId('map-stage'), STAGE.left + 300, STAGE.top + 200);
    pointer('pointerup', byId('map-stage'), STAGE.left + 300, STAGE.top + 200);
    await flush();
    expect(byId('annotation-inspector').dataset.state).toBe('open');
    byId('fetch-open').click();
    expectPageOpen('fetch-panel');
    expect(byId('annotation-inspector').dataset.state).toBe('closed');
  });
});

describe('above the threshold the pages keep their page-flow shapes', () => {
  test('no overlay state on the panels; focus as before; the hidden class is the only flag', async () => {
    await mountApp({ singleFile: true });
    await placeExampleMarkers([
      [0, 60, 100],
      [2, 400, 300],
    ]);
    byId('tab-presentation').click();
    await flush();
    byId('export-open').click();
    expect(byId('export-panel').classList.contains('hidden')).toBe(false);
    expect(byId('export-panel').dataset.state).toBeUndefined();
    expect(byId('export-panel').inert).toBe(false);
    expect(document.activeElement).toBe(byId('export-go'));
    esc();
    expect(byId('export-panel').classList.contains('hidden')).toBe(true);
    expect(document.activeElement).toBe(byId('export-open'));
    byId('tab-map').click();
    await flush();
    byId('fetch-open').click();
    expect(byId('fetch-panel').classList.contains('hidden')).toBe(false);
    expect(byId('fetch-panel').dataset.state).toBeUndefined();
    byId('fetch-close').click();
    expect(byId('fetch-panel').classList.contains('hidden')).toBe(true);
  });
});
