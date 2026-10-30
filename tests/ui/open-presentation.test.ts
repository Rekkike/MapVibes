import { beforeEach, describe, expect, test, vi } from 'vitest';
import { byId, flush, importExampleWorkbook, mountApp, placeExampleMarkers, presentationMarkers, setRole, stubImageDecoding, stubStageLayout } from './harness';
import { DATA_ISLAND_ID } from '../../src/singlefile';

// Open presentation, read-only (FR-60): an exported presentation file opened
// in the application is shown in the viewer, through the comparison's strict
// path; nothing in the file runs, nothing is written to the device, nothing
// becomes work.

type App = Awaited<ReturnType<typeof mountApp>>;

let exported = '';

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await flush();
}

async function exportedPage(): Promise<string> {
  const app = await mountApp({ singleFile: true });
  await placeExampleMarkers([
    [0, 60, 100],
    [2, 400, 300],
  ]);
  byId('tab-information').click();
  setRole('ID', 'identifier');
  return app.exportPage(new Date(2024, 7, 9, 10, 30))!;
}

async function mountEditor(): Promise<App> {
  return mountApp({
    beforeMain: () => {
      stubStageLayout();
      stubImageDecoding(1200, 800);
    },
  });
}

function htmlFile(text: string, name = 'presentation.html'): File {
  return new File([text], name, { type: 'text/html' });
}

async function choose(file: File): Promise<void> {
  const input = byId<HTMLInputElement>('presentation-file-input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await settle();
}

// The island of an exported page, changed.
function withIsland(page: string, change: (data: Record<string, any>) => void): string {
  const doc = new DOMParser().parseFromString(page, 'text/html');
  const node = doc.getElementById(DATA_ISLAND_ID)!;
  const data = JSON.parse(node.textContent!);
  change(data);
  const start = page.indexOf(`<script type="application/json" id="${DATA_ISLAND_ID}">`);
  const end = page.indexOf('</script>', start);
  return `${page.slice(0, start)}<script type="application/json" id="${DATA_ISLAND_ID}">\n${JSON.stringify(data).replace(/</g, '\\u003c')}\n${page.slice(end)}`;
}

const status = () => byId('work-status').textContent;
const inViewer = () => document.documentElement.dataset.mode === 'viewer';

describe('Open presentation (FR-60)', () => {
  beforeEach(async () => {
    if (exported === '') exported = await exportedPage();
    delete document.documentElement.dataset.mode;
  });

  test('the action sits beside the demo, with a file chooser for exported pages', async () => {
    await mountEditor();
    expect(byId('open-presentation').parentElement!.id).toBe('manual-start-row');
    expect(byId('open-presentation').textContent).toBe('Open presentation');
    expect(byId<HTMLInputElement>('presentation-file-input').accept).toBe('.html,.htm,text/html');
    expect(byId('presentation-close').classList.contains('hidden')).toBe(true);
  });

  test('a valid exported file is shown in the view-only viewer; the editor is gone; a close action appears', async () => {
    await mountEditor();
    await choose(htmlFile(exported));
    expect(inViewer()).toBe(true);
    expect(presentationMarkers().map((m) => m.textContent)).toEqual(['1', '3']);
    for (const id of ['segment-information', 'segment-map', 'work-controls', 'segment-nav', 'export-open']) expect(byId(id).classList.contains('hidden'), id).toBe(true);
    expect(byId('segment-presentation').classList.contains('hidden')).toBe(false);
    expect(byId('viewer-badge').textContent).toMatch(/^View-only presentation, exported 2024-08-09 10:30$/);
    expect(byId('presentation-close').classList.contains('hidden')).toBe(false);
    expect(byId('presentation-close').textContent).toBe('Close presentation');
  });

  test('nothing in the file runs: a script added to the page is never executed', async () => {
    await mountEditor();
    const hostile = exported.replace('<body>', '<body><script>window.__ran = true</script><img src="x" onerror="window.__ran = true">');
    await choose(htmlFile(hostile));
    expect(inViewer()).toBe(true);
    expect((window as unknown as { __ran?: boolean }).__ran).toBeUndefined();
  });

  test('a tampered island is refused strictly, and nothing changes', async () => {
    const app = await mountEditor();
    await importExampleWorkbook();
    const before = app.captureWorkState();
    for (const change of [
      (d: Record<string, any>) => (d.numbers = [3, 1]),
      (d: Record<string, any>) => (d.workState.rows[0].values.Nowhere = 'x'),
      (d: Record<string, any>) => (d.workState.background.dataUrl = 'javascript:alert(1)'),
      (d: Record<string, any>) => (d.preferences.language = 'xx'),
    ]) {
      await choose(htmlFile(withIsland(exported, change)));
      expect(inViewer()).toBe(false);
      expect(status()).toBe('The data embedded in the exported file could not be read. Nothing was opened.');
    }
    await choose(htmlFile(withIsland(exported, (d) => (d.exportVersion = 99))));
    expect(status()).toBe('The exported file has export format version 99, which this version of MapVibes cannot read. Nothing was opened.');
    await choose(htmlFile('<!doctype html><html><body><p>Not a presentation</p></body></html>'));
    expect(status()).toBe('The file holds no MapVibes export data. Nothing was opened.');
    expect(inViewer()).toBe(false);
    expect(app.captureWorkState().rows).toEqual(before.rows);
  });

  test('presets smuggled into a file are not written to the device', async () => {
    await mountEditor();
    const stored = localStorage.getItem('mapvibes.presets');
    const smuggled = withIsland(exported, (d) => {
      d.workState.presets = [{ name: 'Smuggled', headers: ['ID'], hidden: [], roles: {} }];
    });
    await choose(htmlFile(smuggled));
    expect(inViewer()).toBe(true);
    expect(localStorage.getItem('mapvibes.presets')).toBe(stored);
  });

  test('a file larger than 50 MB is refused before it is read', async () => {
    await mountEditor();
    const file = htmlFile(exported);
    Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 + 1 });
    const read = vi.spyOn(FileReader.prototype, 'readAsText');
    await choose(file);
    expect(read).not.toHaveBeenCalled();
    read.mockRestore();
    expect(inViewer()).toBe(false);
    expect(status()).toBe('The file is larger than 50 MB. Nothing was opened.');
  });

  test('unsaved work is asked about first; declining keeps it', async () => {
    const app = await mountEditor();
    await importExampleWorkbook();
    expect(byId('work-dirty').classList.contains('hidden')).toBe(false);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await choose(htmlFile(exported));
    expect(confirm).toHaveBeenCalledWith('The current work has unsaved changes. Opening the presentation replaces what is on screen and the unsaved changes are lost. Continue?');
    expect(inViewer()).toBe(false);
    expect(app.captureWorkState().rows).toHaveLength(5);
    confirm.mockReturnValue(true);
    await choose(htmlFile(exported));
    expect(inViewer()).toBe(true);
    confirm.mockRestore();
    // What was on screen was given up: leaving needs no further guard.
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });

  test('the action and the close action follow the language', async () => {
    await mountEditor();
    const lang = byId<HTMLSelectElement>('select-language');
    lang.value = 'sv';
    lang.dispatchEvent(new Event('change'));
    expect(byId('open-presentation').textContent).toBe('Öppna presentation');
    expect(byId('presentation-close').textContent).toBe('Stäng presentationen');
  });
});
