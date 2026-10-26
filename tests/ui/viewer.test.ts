import { beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, flush, mountApp, placeExampleMarkers, pointer, presentationMarkers, setRole, STAGE, stubImageDecoding, stubStageLayout } from './harness';
import { DATA_ISLAND_ID } from '../../src/singlefile';

// Builds an exported page from the application: three placed items (one of
// them switched off), one item without a marker, a comment, Swedish, dark.
async function exportedPage(): Promise<string> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2024, 7, 9, 10, 30));
  const app = await mountApp({ singleFile: true });
  await placeExampleMarkers([
    [0, 60, 100],
    [2, 400, 300],
    [4, 760, 500],
  ]);
  byId('tab-information').click();
  setRole('Group', 'area');
  document.querySelectorAll<HTMLElement>('#row-table-body tr')[2].querySelector<HTMLElement>('.row-details')!.click();
  byId('details-panel').querySelector<HTMLTextAreaElement>('.details-comment-input')!.value = 'Seen in the viewer.';
  byId('details-panel').querySelector<HTMLButtonElement>('.details-comment-add')!.click();
  byId('tab-presentation').click();
  await flush();
  // Switch off the second placed item (A-03 is kept, A-01 switched off).
  document.querySelectorAll<HTMLInputElement>('.visibility-toggle')[0].click();
  const lang = byId<HTMLSelectElement>('select-language');
  lang.value = 'sv';
  lang.dispatchEvent(new Event('change'));
  const theme = byId<HTMLSelectElement>('select-theme');
  theme.value = 'dark';
  theme.dispatchEvent(new Event('change'));
  const page = app.exportPage(new Date(2024, 7, 9, 10, 30))!;
  vi.useRealTimers();
  return page;
}

async function mountViewer(page: string, options: { keepStorage?: boolean } = {}) {
  const doc = new DOMParser().parseFromString(page, 'text/html');
  const app = await mountApp({
    body: doc.body.innerHTML,
    keepStorage: options.keepStorage,
    beforeMain: () => {
      stubStageLayout();
      stubImageDecoding(1200, 800);
    },
  });
  await flush();
  return app;
}

function listEntries(): string[][] {
  return [...document.querySelectorAll('#visibility-list .visibility-item')].map((li) => [
    li.querySelector('.marker-badge')!.textContent ?? '',
    li.querySelector('.placement-label')!.textContent ?? '',
    li.querySelector('.placement-status')?.textContent ?? '',
  ]);
}

function tap(marker: HTMLElement): void {
  const x = STAGE.left + parseFloat(marker.style.left);
  const y = STAGE.top + parseFloat(marker.style.top);
  pointer('pointerdown', marker, x, y);
  pointer('pointerup', marker, x, y);
}

describe('exported viewer (FR-38, FR-20)', () => {
  let page: string;

  beforeEach(async () => {
    page = await exportedPage();
    await mountViewer(page);
  });

  test('the exported page starts as the view-only presentation', () => {
    expect(document.getElementById(DATA_ISLAND_ID)).not.toBeNull();
    expect(document.documentElement.dataset.mode).toBe('viewer');
    expect(byId('segment-presentation').classList.contains('hidden')).toBe(false);
    for (const id of ['segment-nav', 'work-controls', 'export-open', 'export-panel', 'segment-information', 'segment-map', 'details-panel']) {
      expect(byId(id).classList.contains('hidden'), id).toBe(true);
      expect(byId(id).hasAttribute('inert'), id).toBe(true);
    }
    expect(byId('viewer-badge').textContent).toBe('Presentation endast för visning, exporterad 2024-08-09 10:30');
  });

  test('language and theme follow the exported work', () => {
    expect(document.documentElement.lang).toBe('sv');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(byId<HTMLSelectElement>('select-language').value).toBe('sv');
    expect(byId('visibility-heading').textContent).toBe('Objekt');
  });

  test('choices made in the viewer are not remembered', () => {
    const before = localStorage.getItem('mapvibes.preferences');
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'en';
    lang.dispatchEvent(new Event('change'));
    const theme = byId<HTMLSelectElement>('select-theme');
    theme.value = 'light';
    theme.dispatchEvent(new Event('change'));
    expect(byId('visibility-heading').textContent).toBe('Items');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('mapvibes.preferences')).toBe(before);
  });

  test('the stage shows the background and the markers with their presentation numbers', () => {
    expect(byId('presentation-stage').dataset.hasBackground).toBe('true');
    expect(byId<HTMLImageElement>('presentation-image').getAttribute('src')!.startsWith('data:image/png;base64,')).toBe(true);
    expect(presentationMarkers().map((m) => m.textContent)).toEqual(['3', '5']);
    const legend = [...byId('presentation-legend').querySelectorAll<HTMLElement>('.legend-entry[data-colour]')].map((e) => e.dataset.colour);
    expect(legend).toEqual(['green', 'blue', 'yellow', 'red']);
  });

  test('the item list holds every exported item with its number; no visibility toggles exist', () => {
    expect(listEntries()).toEqual([
      ['2', 'A-02', 'inte på kartan'],
      ['3', 'A-03', ''],
      ['4', 'A-04', 'inte på kartan'],
      ['5', 'A-05', ''],
    ]);
    expect(document.querySelectorAll('.visibility-toggle')).toHaveLength(0);
    expect(document.body.textContent).not.toContain('A-01');
  });

  test('the at-a-glance panel lists the markers in view', () => {
    const entries = [...document.querySelectorAll('#presentation-glance-list .glance-entry')].map((e) => [
      e.querySelector('.marker-badge')!.textContent,
      e.querySelector('.glance-name')!.textContent,
      e.querySelector('.glance-area')?.textContent ?? '',
    ]);
    expect(entries).toEqual([
      ['3', 'A-03', 'South'],
      ['5', 'A-05', ''],
    ]);
  });

  test('a marker opens its data card with the comments; nothing on it can be edited', () => {
    tap(presentationMarkers()[0]);
    const card = byId('presentation-card');
    expect(card.dataset.state).toBe('open');
    expect(card.querySelector('.details-title')!.textContent).toBe('A-03');
    expect([...card.querySelectorAll('.details-comment-text')].map((n) => n.textContent)).toEqual(['Seen in the viewer.']);
    expect(card.querySelectorAll('input, select, textarea')).toHaveLength(0);
  });

  test('the list opens the card, also for an item without a marker, in the corner of the stage', () => {
    document.querySelectorAll<HTMLButtonElement>('#visibility-list .item-open')[0].click();
    const card = byId('presentation-card');
    expect(card.dataset.state).toBe('open');
    expect(card.querySelector('.details-title')!.textContent).toBe('A-02');
    expect(card.querySelector('.details-badge')).toBeNull();
    expect(card.style.left).toBe('16px');
    card.querySelector<HTMLButtonElement>('.details-close')!.click();
    expect(card.dataset.state).toBe('closed');
  });

  test('zoom, pan, and fit work', () => {
    const before = byId('presentation-content').style.transform;
    byId('pres-zoom-in').click();
    expect(byId('presentation-content').style.transform).not.toBe(before);
    pointer('pointerdown', byId('presentation-stage'), STAGE.left + 300, STAGE.top + 300);
    pointer('pointermove', byId('presentation-stage'), STAGE.left + 350, STAGE.top + 300);
    pointer('pointerup', byId('presentation-stage'), STAGE.left + 350, STAGE.top + 300);
    byId('pres-fit').click();
    expect(byId('presentation-content').style.transform).toBe(before);
  });

  test('markers cannot be moved; nothing becomes work to save', () => {
    const marker = presentationMarkers()[0];
    pointer('pointerdown', marker, STAGE.left + 400, STAGE.top + 300);
    pointer('pointermove', marker, STAGE.left + 500, STAGE.top + 300);
    pointer('pointerup', marker, STAGE.left + 500, STAGE.top + 300);
    byId('pres-fit').click();
    expect(presentationMarkers()[0].style.left).toBe('400px');
    expect(byId('work-dirty').classList.contains('hidden')).toBe(true);
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  test('saving and exporting are not available', async () => {
    const app = await import('../../src/main');
    expect(await app.saveWork()).toBe('cancelled');
    byId('export-open').click();
    expect(byId('export-panel').classList.contains('hidden')).toBe(true);
  });
});

describe('exported viewer with damaged data', () => {
  test('a damaged island is reported and nothing is shown', async () => {
    const page = (await exportedPage()).replace('"exportVersion": 2', '"exportVersion": 99');
    await mountViewer(page);
    expect(document.documentElement.dataset.mode).toBe('viewer');
    expect(presentationMarkers()).toHaveLength(0);
    expect(byId('presentation-empty-hint').textContent).toContain('could not be read');
  });
});
