// Saving and opening the work state (FR-13): capture, write, share, and
// applying an opened file.
import { clonePreset, storePresets, upsertPreset } from './presets';
import { strings, type Strings } from './i18n';
import { commentsOf, restoreComments } from './comments';
import { type Problem, parseWorkState, serialiseWorkState, SUGGESTED_FILE_NAME, WorkStateError, type WorkState } from './workstate';
import { SUGGESTED_EXPORT_NAME } from './exportfile';
import { newAnnotationId, type Annotation } from './annotations';
import { demoLoaded, setDemoLoaded, setSegment } from './main';
import { el, state } from './appstate';
import { cloneSeries, isHtmlFile, openExportForComparison } from './exportdialog';
import { workPhaseOf } from './activitydialog';
import { closePdf, mapView, showMapError } from './mapstage';
import { currentCostsView, currentTimelineView, restoreCostsView, restoreTimelineView } from './presentationstage';
import { renderList } from './listpanel';
import { effectiveSeries, setEventMessage, setPresetMessage } from './columnpanels';

// The number of changes made, and its value when the demo finished loading,
// so that a reset of an untouched demo needs no confirmation (FR-56).
export let changeCount = 0;

// Work-state file (FR-13): the complete state as one snapshot.
export function captureWorkState(): WorkState {
  const retained = new Set(state.rows);
  const index = new Map(state.ingested.map((row, i) => [row, i]));
  const markers = [...state.positions.entries()]
    .filter(([row]) => index.has(row) && retained.has(row))
    .map(([row, position]) => ({ row: index.get(row)!, position: { ...position }, symbol: state.shapes.get(row) ?? null }))
    .sort((a, b) => a.row - b.row);
  const bg = mapView?.background ?? null;
  return {
    roles: { ...state.roles },
    headers: [...state.headers],
    manualColumns: state.headers.filter((h) => state.manualColumns.has(h)).map((key) => ({ key, label: state.manualColumns.get(key)! })),
    hiddenHeaders: state.headers.filter((h) => state.hiddenHeaders.has(h)),
    rows: state.ingested.map((row) => ({
      values: { ...row.values },
      colour: row.colour,
      removed: !retained.has(row),
      manual: state.manualRows.has(row),
      edited: { ...(state.edited.get(row) ?? {}) },
      comments: commentsOf(state.comments, row).map((c) => ({ date: c.date, text: c.text, ...(c.edited ? { edited: c.edited } : {}) })),
      ...(state.activities.get(row)?.length ? { activities: state.activities.get(row)!.map((a) => ({ ...a })) } : {}),
      ...(workPhaseOf(row) !== undefined ? { workPhase: workPhaseOf(row) } : {}),
      ...(state.activityImports.has(row)
        ? { activityImport: { ...state.activityImports.get(row)!, columns: { ...state.activityImports.get(row)!.columns } } }
        : {}),
    })),
    background: bg ? { ...bg } : null,
    markers,
    excluded: [...state.excluded]
      .filter((row) => retained.has(row))
      .map((row) => index.get(row)!)
      .sort((a, b) => a - b),
    presets: state.presets.map(clonePreset),
    areaValues: [...state.areaValues],
    programValues: [...state.programValues],
    colourLabels: { ...state.colourLabels },
    symbolLabels: { ...state.symbolLabels },
    glanceColumns: state.glanceColumns ? state.glanceColumns.filter((k) => state.headers.includes(k)) : null,
    cardColumns: state.cardColumns ? state.cardColumns.filter((k) => state.headers.includes(k)) : null,
    series: effectiveSeries(),
    currencyUnit: state.currencyUnit,
    annotations: state.annotations.map((a) => {
      const linked = state.annotationLinks.get(a.id);
      return {
        kind: a.kind,
        points: a.points.map((p) => ({ ...p })),
        colour: a.colour,
        fillOpacity: a.fillOpacity,
        outline: a.outline,
        lineStyle: a.lineStyle,
        label: a.label,
        link: linked && index.has(linked) ? index.get(linked)! : null,
        hidden: state.hiddenAnnotations.has(a.id),
      };
    }),
    statuses: state.statuses.map((x) => ({ ...x })),
    symbolsFromStatus: state.symbolsFromStatus,
    segment: state.segment,
    viewport: { ...(mapView?.viewport ?? { scale: 1, x: 0, y: 0 }) },
    sort: { ...state.sort },
    filter: { ...state.filter },
    numbering: state.numbering,
    listView: state.listView,
    presentationMode: state.presentationMode,
    timelineView: currentTimelineView(),
    presentationOrder: state.presentationOrder,
    events: state.events.map((e) => ({ ...e })),
    costsView: currentCostsView(),
  };
}

function hasWork(): boolean {
  return state.ingested.length > 0 || (mapView?.background !== null && mapView?.background !== undefined);
}

type WriteOutcome = 'saved' | 'cancelled' | 'failed';

interface SaveFilePickerWindow {
  showSaveFilePicker?: (options: unknown) => Promise<{
    createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}

// Writes the file where the user chooses: through the browser's save dialog
// where the File System Access API exists, otherwise as a browser download
// (the browser's download settings decide whether the user is asked where).
// Either way the data goes only to the local file system.
interface FileKind {
  name: string;
  mime: string;
  extension: string;
  description: string;
}

const WORK_STATE_FILE: FileKind = { name: SUGGESTED_FILE_NAME, mime: 'application/json', extension: '.json', description: 'MapVibes work state' };
export const EXPORT_FILE: FileKind = { name: SUGGESTED_EXPORT_NAME, mime: 'text/html', extension: '.html', description: 'MapVibes presentation' };
export const PDF_FILE: FileKind = { name: 'mapvibes-presentation.pdf', mime: 'application/pdf', extension: '.pdf', description: 'PDF document' };
export const PPTX_FILE: FileKind = {
  name: 'mapvibes-presentation.pptx',
  mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  extension: '.pptx',
  description: 'PowerPoint presentation',
};

// Writes a file only on the user's explicit action: through the save dialog
// where the browser has one, otherwise as a download. The route is reported
// back, because only the dialog confirms the write: a download only starts.
export async function writeFile(data: string | Uint8Array, kind: FileKind): Promise<{ outcome: WriteOutcome; via: 'picker' | 'download' }> {
  const blob = new Blob([data as BlobPart], { type: kind.mime });
  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;
  if (typeof picker === 'function') {
    try {
      const handle = await picker.call(window, {
        suggestedName: kind.name,
        types: [{ description: kind.description, accept: { [kind.mime]: [kind.extension] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { outcome: 'saved', via: 'picker' };
    } catch (e) {
      return { outcome: e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'failed', via: 'picker' };
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = kind.name;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return { outcome: 'saved', via: 'download' };
  } catch {
    return { outcome: 'failed', via: 'download' };
  }
}

type WorkMessage = 'saved' | 'download-started' | 'save-failed' | 'shared' | 'share-failed' | 'opened' | 'open-failed' | 'compare-opened' | 'demo-loaded';
export let workMessage: WorkMessage | null = null;
export function setWorkMessage(value: WorkMessage | null): void {
  workMessage = value;
}
let workErrorText = '';

// Content changes mark the work as unsaved: the ingested rows, removals,
// colours, the background, and markers. View changes (segment, zoom and pan,
// list sorting, filtering, and column visibility) are saved with the work
// but do not by themselves count as unsaved changes.
export function markDirty(): void {
  // Nothing in the exported viewer is work to save.
  if (state.viewOnly) {
    return;
  }
  state.dirty = true;
  changeCount++;
  if (workMessage === 'saved' || workMessage === 'download-started' || workMessage === 'shared' || workMessage === 'opened' || workMessage === 'demo-loaded') {
    workMessage = null;
  }
  renderWorkStatus();
}

export function renderWorkStatus(): void {
  const t = strings(state.prefs.lang);
  // The Menu button carries the unsaved state while the work controls are
  // in the Menu overlay (FR-71).
  const menu = el('menu-toggle');
  menu.textContent = t.menu;
  menu.dataset.dirty = state.dirty ? 'true' : 'false';
  menu.setAttribute('aria-label', state.dirty ? t.menuUnsaved : t.menu);
  const status = el('work-status');
  const messages: Record<WorkMessage, string> = {
    saved: t.workSaved,
    'download-started': t.workDownloadStarted,
    'save-failed': t.workSaveFailed,
    shared: t.workShared,
    'share-failed': t.workShareFailed,
    opened: t.workOpened,
    'open-failed': workErrorText,
    'compare-opened': t.compareOpened,
    'demo-loaded': t.demoLoaded,
  };
  status.textContent = workMessage ? messages[workMessage] : '';
  status.classList.toggle('error', workMessage === 'save-failed' || workMessage === 'open-failed');
  el<HTMLButtonElement>('work-save').disabled = !hasWork();
  // The share action (FR-13 as noted): offered only where the
  // browser can share files; hidden without the API, disabled with a clear
  // message when files cannot be shared; nothing is claimed otherwise.
  const shareButton = el<HTMLButtonElement>('work-share');
  shareButton.textContent = t.workShare;
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean };
  if (typeof nav.share !== 'function') {
    shareButton.classList.add('hidden');
    shareButton.disabled = true;
  } else {
    shareButton.classList.remove('hidden');
    let filesOk = true;
    if (typeof nav.canShare === 'function') {
      try {
        filesOk = nav.canShare({ files: [new File(['x'], WORK_STATE_FILE.name, { type: WORK_STATE_FILE.mime })] });
      } catch {
        filesOk = false;
      }
    }
    shareButton.disabled = !hasWork() || !filesOk;
    shareButton.title = filesOk ? '' : t.workShareUnsupported;
    shareButton.setAttribute('aria-label', filesOk ? t.workShare : `${t.workShare}: ${t.workShareUnsupported}`);
  }
  el('work-dirty').textContent = t.workUnsaved;
  el('work-dirty').classList.toggle('hidden', !state.dirty);
  document.documentElement.dataset.unsaved = state.dirty ? 'true' : 'false';
  // The demo's work is labelled as example data while it is loaded.
  el('demo-badge').textContent = t.demoBadge;
  el('demo-badge').classList.toggle('hidden', !demoLoaded);
  el('demo-reset').textContent = t.demoReset;
  el('demo-reset').classList.toggle('hidden', !demoLoaded);
  document.documentElement.dataset.demo = demoLoaded ? 'true' : 'false';
}

export async function saveWork(): Promise<WriteOutcome> {
  if (state.viewOnly) {
    return 'cancelled';
  }
  const text = serialiseWorkState(captureWorkState(), new Date());
  const { outcome, via } = await writeFile(text, WORK_STATE_FILE);
  if (outcome === 'saved' && via === 'picker') {
    // The save dialog itself confirms the write.
    state.dirty = false;
    workMessage = 'saved';
  } else if (outcome === 'saved' && via === 'download') {
    // The honest save status (FR-13 as noted): a download only
    // starts, so the status says so and the unsaved mark stays until the
    // next open of a work file or an explicit confirmation.
    workMessage = 'download-started';
    if (window.confirm(strings(state.prefs.lang).workDownloadConfirm)) {
      state.dirty = false;
      workMessage = 'saved';
    }
  } else if (outcome !== 'cancelled') {
    workMessage = 'save-failed';
  }
  renderWorkStatus();
  return outcome;
}

// The share action (FR-13 as noted): the work file handed to the
// operating system's share sheet through navigator.share, gated on the
// browser's support for sharing files. Fully local: the OS share sheet, no
// network call by the application. Sharing is not saving: the unsaved mark
// is untouched.
export async function shareWork(): Promise<void> {
  if (state.viewOnly) {
    return;
  }
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
  if (typeof nav.share !== 'function') {
    return;
  }
  const text = serialiseWorkState(captureWorkState(), new Date());
  const file = new File([text], WORK_STATE_FILE.name, { type: WORK_STATE_FILE.mime });
  try {
    await nav.share({ files: [file], title: WORK_STATE_FILE.name });
    workMessage = 'shared';
  } catch (e) {
    // The user closed the share sheet: nothing happened, nothing is claimed.
    if (e instanceof DOMException && e.name === 'AbortError') {
      return;
    }
    workMessage = 'share-failed';
  }
  renderWorkStatus();
}

export function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('the file could not be read'));
    reader.readAsText(file);
  });
}

function problemText(problem: Problem): string {
  const t = strings(state.prefs.lang);
  const key = `problem${problem.kind[0].toUpperCase()}${problem.kind.slice(1)}` as keyof Strings;
  return t[key].replace('{field}', problem.field);
}

function openErrorText(e: unknown): string {
  const t = strings(state.prefs.lang);
  if (e instanceof WorkStateError) {
    if (e.code === 'unknown-version') {
      return t.workOpenUnknownVersion.replace('{version}', e.detail);
    }
    if (e.code === 'invalid' && e.problem) {
      return `${t.workOpenInvalid} ${problemText(e.problem)}.`;
    }
    return t.workOpenNotWorkState;
  }
  return t.workOpenUnreadable;
}

export function reportOpenFailure(text: string): void {
  workMessage = 'open-failed';
  workErrorText = text;
  renderWorkStatus();
}

// Restores a complete work state. The background is decoded first; if that
// fails, nothing else is changed.
export async function applyWorkState(ws: WorkState): Promise<boolean> {
  if (!mapView) {
    return false;
  }
  await closePdf();
  showMapError(null);
  if (ws.background) {
    const ok = await mapView.setBackgroundSource(ws.background.src, ws.viewport, ws.background.projection);
    if (!ok) {
      showMapError(null);
      return false;
    }
  } else {
    mapView.clearBackground(ws.viewport);
  }
  state.roles = { ...ws.roles };
  state.manualColumns = new Map(ws.manualColumns.map((c) => [c.key, c.label]));
  state.activePreset = null;
  setPresetMessage(null);
  state.headers = [...ws.headers];
  state.visibleHeaders = [...ws.headers];
  state.hiddenHeaders = new Set(ws.hiddenHeaders);
  state.ingested = ws.rows.map((r) => ({ values: { ...r.values }, colour: r.colour }));
  state.rows = state.ingested.filter((_, i) => !ws.rows[i].removed);
  state.manualRows = new Set(state.ingested.filter((_, i) => ws.rows[i].manual));
  setDemoLoaded(false);
  state.edited = new Map(state.ingested.flatMap((row, i) => (Object.keys(ws.rows[i].edited).length > 0 ? [[row, { ...ws.rows[i].edited }]] : [])));
  state.activities = new Map(
    state.ingested.flatMap((row, i) =>
      ws.rows[i].activities && ws.rows[i].activities.length > 0 ? [[row, ws.rows[i].activities.map((a) => ({ ...a }))]] : [],
    ),
  );
  state.workPhases = new Map(state.ingested.flatMap((row, i) => (ws.rows[i].workPhase !== undefined ? [[row, ws.rows[i].workPhase]] : [])));
  state.activityImports = new Map(
    state.ingested.flatMap((row, i) =>
      ws.rows[i].activityImport ? [[row, { ...ws.rows[i].activityImport, columns: { ...ws.rows[i].activityImport.columns } }]] : [],
    ),
  );
  state.comments = new Map(state.ingested.flatMap((row, i) => (ws.rows[i].comments.length > 0 ? [[row, restoreComments(ws.rows[i].comments)]] : [])));
  state.detailsId = null;
  state.rowIds = new Map();
  state.selected = new Set();
  state.selectedMarker = null;
  state.positions = new Map(ws.markers.map((m) => [state.ingested[m.row], { ...m.position }]));
  state.excluded = new Set(ws.excluded.map((i) => state.ingested[i]));
  state.presentationSelected = null;
  state.shapes = new Map(ws.markers.filter((m) => m.symbol !== null).map((m) => [state.ingested[m.row], m.symbol!]));
  state.areaValues = [...ws.areaValues];
  state.programValues = [...ws.programValues];
  state.colourLabels = { ...ws.colourLabels };
  state.symbolLabels = { ...ws.symbolLabels };
  state.glanceColumns = ws.glanceColumns ? [...ws.glanceColumns] : null;
  state.cardColumns = ws.cardColumns ? [...ws.cardColumns] : null;
  state.series = cloneSeries(ws.series);
  state.currencyUnit = ws.currencyUnit;
  state.annotations = [];
  state.annotationLinks = new Map();
  state.hiddenAnnotations = new Set();
  state.selectedAnnotation = null;
  for (const a of ws.annotations) {
    const annotation: Annotation = {
      id: newAnnotationId(),
      kind: a.kind,
      points: a.points.map((p) => ({ ...p })),
      colour: a.colour,
      fillOpacity: a.fillOpacity,
      outline: a.outline,
      lineStyle: a.lineStyle,
      label: a.label,
    };
    state.annotations.push(annotation);
    if (a.link !== null) {
      state.annotationLinks.set(annotation.id, state.ingested[a.link]);
    } else if (a.hidden) {
      state.hiddenAnnotations.add(annotation.id);
    }
  }
  state.statuses = ws.statuses.map((x) => ({ ...x }));
  state.symbolsFromStatus = ws.symbolsFromStatus;
  // Presets in the file are merged into the saved presets; a preset in the
  // file replaces a saved preset of the same name (FR-23). A presentation
  // shown in the viewer writes nothing to the device (FR-38, FR-60).
  if (ws.presets.length > 0 && !state.viewOnly) {
    for (const preset of ws.presets) {
      state.presets = upsertPreset(state.presets, preset);
    }
    storePresets(state.presets);
  }
  state.sort = { ...ws.sort };
  state.filter = { ...ws.filter };
  state.numbering = ws.numbering;
  state.listView = ws.listView;
  state.presentationMode = ws.presentationMode;
  state.presentationOrder = ws.presentationOrder;
  restoreTimelineView(ws.timelineView);
  state.events = ws.events.map((e) => ({ ...e }));
  setEventMessage('');
  restoreCostsView(ws.costsView);

  el('ingest-error').classList.add('hidden');
  const hasRows = state.ingested.length > 0;
  el('list-panel').classList.toggle('hidden', !hasRows);
  el('no-file').classList.toggle('hidden', hasRows);
  el<HTMLSelectElement>('select-filter-kind').value = state.filter.kind;
  const filterText = el<HTMLInputElement>('filter-text');
  filterText.value = state.filter.text;
  filterText.classList.toggle('hidden', state.filter.kind !== 'contains');
  renderList();
  setSegment(ws.segment);
  state.dirty = false;
  workMessage = 'opened';
  renderWorkStatus();
  return true;
}

export async function openWorkFile(file: File): Promise<boolean> {
  if (state.viewOnly) {
    return false;
  }
  let text: string;
  try {
    text = await readText(file);
  } catch {
    reportOpenFailure(strings(state.prefs.lang).workOpenUnreadable);
    return false;
  }
  // An exported file (FR-14) is opened for comparison; it never replaces
  // the current work.
  if (isHtmlFile(file, text)) {
    return openExportForComparison(text);
  }
  let ws: WorkState;
  try {
    ws = parseWorkState(text);
  } catch (e) {
    reportOpenFailure(openErrorText(e));
    return false;
  }
  if (state.dirty && !window.confirm(strings(state.prefs.lang).workConfirmReplace)) {
    return false;
  }
  const ok = await applyWorkState(ws);
  if (!ok) {
    reportOpenFailure(strings(state.prefs.lang).workOpenBackgroundFailed);
  }
  return ok;
}
