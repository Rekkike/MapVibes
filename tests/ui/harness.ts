import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';

const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

export function exampleFile(name: string, type: string): File {
  const buf = readFileSync(join(process.cwd(), 'example-data', name));
  const file = new File([buf], name, { type });
  // jsdom's Blob does not implement arrayBuffer(); the browser's does.
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(buf);
  Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.buffer, configurable: true });
  return file;
}

function stubMatchMedia(): void {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// Mounts the real application markup into the jsdom document and starts a
// fresh instance of the application module.
// Window listeners added by earlier application instances in the same jsdom
// window are removed, so that each test sees only its own instance.
const windowListeners: Array<[string, EventListenerOrEventListenerObject]> = [];
const originalAddEventListener = window.addEventListener.bind(window);
window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: unknown) => {
  windowListeners.push([type, listener]);
  originalAddEventListener(type, listener, options as AddEventListenerOptions);
}) as typeof window.addEventListener;

// Mounts the application. Unless a first run is requested (empty storage),
// English is remembered as the language, so that tests read English strings;
// the first-run default itself is Swedish (FR-19).
export async function mountApp(options: { keepStorage?: boolean; firstRun?: boolean } = {}): Promise<typeof import('../../src/main')> {
  for (const [type, listener] of windowListeners.splice(0)) window.removeEventListener(type, listener);
  stubMatchMedia();
  if (!options.keepStorage) {
    localStorage.clear();
    if (!options.firstRun) localStorage.setItem('mapvibes.preferences', JSON.stringify({ lang: 'en', theme: 'system' }));
  }
  const doc = new DOMParser().parseFromString(indexHtml, 'text/html');
  doc.querySelectorAll('script').forEach((s) => s.remove());
  document.head.innerHTML = '';
  document.body.innerHTML = doc.body.innerHTML;
  document.documentElement.removeAttribute('data-segment');
  vi.resetModules();
  const app = await import('../../src/main');
  app.main();
  return app;
}

export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}

// Imports the example workbook through the real file-picker path (direct
// import: the list is populated without any further step).
export async function importExampleWorkbook(): Promise<void> {
  const input = byId<HTMLInputElement>('file-input');
  const file = exampleFile('example.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await flush();
}

export const STAGE = { left: 100, top: 50, width: 800, height: 600 };

// jsdom performs no layout: give the map stage a fixed bounding box.
export function stubStageLayout(): void {
  for (const id of ['map-stage', 'presentation-stage']) {
    const stage = byId(id);
    stage.getBoundingClientRect = () =>
      ({ ...STAGE, x: STAGE.left, y: STAGE.top, right: STAGE.left + STAGE.width, bottom: STAGE.top + STAGE.height, toJSON: () => ({}) }) as DOMRect;
  }
}

// jsdom does not decode images: once the application assigns a source to the
// background image, report the given intrinsic size and fire its load event.
export function stubImageDecoding(width: number, height: number, fail = false): void {
  for (const id of ['map-image', 'presentation-image']) stubOneImage(byId<HTMLImageElement>(id), width, height, fail);
}

function stubOneImage(img: HTMLImageElement, width: number, height: number, fail: boolean): void {
  Object.defineProperty(img, 'naturalWidth', { get: () => width, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { get: () => height, configurable: true });
  const observer = new MutationObserver(() => {
    if (img.getAttribute('src')) setTimeout(() => img.dispatchEvent(new Event(fail ? 'error' : 'load')), 0);
  });
  observer.observe(img, { attributes: true, attributeFilter: ['src'] });
}

export async function loadExampleBackground(): Promise<void> {
  stubStageLayout();
  stubImageDecoding(1200, 800);
  const input = byId<HTMLInputElement>('map-file-input');
  Object.defineProperty(input, 'files', { value: [exampleFile('example-background.png', 'image/png')], configurable: true });
  input.dispatchEvent(new Event('change'));
  await flush();
}

export function pointer(type: string, target: Element, clientX: number, clientY: number, extra: Record<string, unknown> = {}): void {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
  for (const [k, v] of Object.entries({ pointerId: 1, ...extra })) Object.defineProperty(e, k, { value: v });
  target.dispatchEvent(e);
}

// Simulates an HTML drag-and-drop of a placement-list item onto the stage at
// the given client point, through the application's real dragstart and drop
// handlers, with a shared DataTransfer-like store.
export function dragItemToStage(item: HTMLElement, clientX: number, clientY: number): void {
  const store = new Map<string, string>();
  const dataTransfer = {
    setData: (type: string, value: string) => store.set(type, value),
    getData: (type: string) => store.get(type) ?? '',
    get types() {
      return [...store.keys()];
    },
    files: [] as File[],
    effectAllowed: 'all',
    dropEffect: 'none',
  };
  const start = new Event('dragstart', { bubbles: true });
  Object.defineProperty(start, 'dataTransfer', { value: dataTransfer });
  item.dispatchEvent(start);
  const stage = byId('map-stage');
  for (const type of ['dragover', 'drop']) {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
    Object.defineProperty(e, 'dataTransfer', { value: dataTransfer });
    stage.dispatchEvent(e);
  }
}

export function placementItems(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('#placement-list .placement-item')];
}

export function markers(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('#marker-layer .marker')];
}

export type Picker = (options: { suggestedName: string }) => Promise<unknown>;

// Stands in for the browser's save dialog (File System Access API) and
// records what the application writes.
export function stubSaveDialog(outcome: 'save' | 'cancel' | 'fail' = 'save') {
  const written: { name?: string; text?: string; closed: boolean } = { closed: false };
  const picker: Picker = async (options) => {
    written.name = options.suggestedName;
    if (outcome === 'cancel') throw new DOMException('The user aborted a request.', 'AbortError');
    if (outcome === 'fail') throw new DOMException('Not allowed.', 'NotAllowedError');
    return {
      createWritable: async () => ({
        write: async (blob: Blob) => {
          written.text = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.readAsText(blob);
          });
        },
        close: async () => {
          written.closed = true;
        },
      }),
    };
  };
  (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker = picker;
  return written;
}


export function removeSaveDialog(): void {
  delete (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker;
}

export function textFile(name: string, text: string): File {
  return new File([text], name, { type: 'application/json' });
}

export function openWorkFile(file: File): void {
  const input = byId<HTMLInputElement>('work-file-input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
}

// Assigns a role to a column through the in-list role control.
export function setRole(header: string, role: string): void {
  const select = document.querySelector<HTMLSelectElement>(`#row-table-head .role-select[data-header="${header}"]`);
  if (!select) throw new Error(`no role control for ${header}`);
  select.value = role;
  select.dispatchEvent(new Event('change'));
}

export function presentationMarkers(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('#presentation-marker-layer .marker')];
}

// Imports the example, assigns the identifier role, loads the background, and
// places markers for the given list positions at the given stage points.
export async function placeExampleMarkers(points: Array<[number, number, number]>): Promise<void> {
  await importExampleWorkbook();
  setRole('ID', 'identifier');
  byId('tab-map').click();
  await loadExampleBackground();
  for (const [index, x, y] of points) dragItemToStage(placementItems()[index], STAGE.left + x, STAGE.top + y);
}

export function addColumn(name: string): void {
  byId<HTMLInputElement>('new-column-name').value = name;
  byId('add-column').click();
}

export function columnKeyOf(label: string): string {
  const th = [...document.querySelectorAll<HTMLElement>('#row-table-head th[data-header]')].find(
    (h) => h.querySelector('.column-label')!.textContent === label,
  );
  if (!th) throw new Error(`no column ${label}`);
  return th.dataset.header!;
}

// Types a value into an editable cell of the given list row (by position in
// the displayed list) and commits it.
export function editCell(rowIndex: number, label: string, value: string): void {
  const key = columnKeyOf(label);
  const tr = document.querySelectorAll('#row-table-body tr')[rowIndex];
  const input = tr.querySelector<HTMLInputElement>(`.cell-input[data-header="${esc(key)}"]`);
  if (!input) throw new Error(`cell ${rowIndex}/${label} is not editable`);
  input.value = value;
  input.dispatchEvent(new Event('change'));
}

// Escapes a value for use inside a double-quoted attribute selector (jsdom
// has no CSS.escape).
export function esc(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

// The value shown in a list cell: every value is edited in place (FR-10), so
// the value is that of the cell's control; cells without one (the number,
// the selection, the colour) give their text.
export function cellValue(td: Element): string {
  const control = td.querySelector<HTMLInputElement | HTMLSelectElement>('.cell-input');
  return control ? control.value : (td.textContent ?? '');
}
