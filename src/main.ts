import './polyfills';
import { selfPage } from './selfsource';
import type { ValueFilter } from './dataset';
import { parseWorkbook } from './ingest';
import { addStatus, statusNames } from './vocab';
import { clonePreset, storePresets, upsertPreset, type ColumnPreset } from './presets';
import { strings, type Lang } from './i18n';
import { savePreferences, type ThemeChoice } from './preferences';
import { MapView } from './mapview';
import { formatCommentDate, restoreComments } from './comments';
import { DEFAULT_SHAPE, placeMarker } from './markers';
import { isSegment, SEGMENTS, showSegment, type Segment } from './segments';
import { activityId } from './workstate';
import { ExportError, parseExport, serialiseExport, type ExportData } from './exportfile';
import { embedDataIsland, readDataIsland, writeStaticViewerState } from './singlefile';
import { HOSTED_ADDRESS } from './hosted';
import { DEMO_MAP_TEXT, demoCounterparts, demoScenario, demoWorkbook } from './demo';
import { NARROW_QUERY, NarrowDialogs, NarrowViewer, type NarrowDialogSpec } from './narrowviewer';
import { newAnnotationId, type Annotation } from './annotations';
import { currentCounters, el, fill, state } from './appstate';
import { fetchAbort, initialiseFetch } from './fetchpanel';
import {
  applyWorkState,
  changeCount,
  markDirty,
  openWorkFile,
  readText,
  renderWorkStatus,
  reportOpenFailure,
  saveWork,
  setWorkMessage,
  shareWork,
  workMessage,
} from './workfile';
import { closeDocumentDialog, renderDocument } from './documentdialog';
import { adoptPositions, captureExport, closeComparison, closeExportDialog, renderExport, selectAllDiffering, setComparison } from './exportdialog';
import { closeActivityDialog, renderActivityDialog } from './activitydialog';
import { openDetails, renderDetailsPanel } from './detailspanel';
import { drawingTools, renderAnnotationInspector, selectAnnotation, setDrawingTool } from './annotationpanel';
import { closePdf, initialiseMapView, mapView, renderMapItems, renderPlacing, stopPlacing, useOsmText } from './mapstage';
import {
  cardId,
  closeCard,
  closeEconomics,
  initialisePresentation,
  presentationView,
  renderInformationTotals,
  renderLegends,
  renderPresentation,
  restoreCostsView,
  restoreTimelineView,
  setViewerView,
} from './presentationstage';
import { addManualColumn, addManualRow, applyImport, deleteSelected, handleFile, renderList, selectAllVisible, setListView, startEmptyList } from './listpanel';
import {
  addEvent,
  addVocabValue,
  applySelectedPreset,
  collectVocabValues,
  removeSelectedPreset,
  saveCurrentPreset,
  setEventMessage,
  setNumbering,
  setStatuses,
  setSymbolsFromStatus,
  VALUE_VOCABULARIES,
} from './columnpanels';
export { ROW_DRAG_TYPE } from './appstate';
export { MAX_IMPORT_BYTES } from './listpanel';
export { captureWorkState, saveWork, openWorkFile } from './workfile';
export { captureExport } from './exportdialog';
export type { ExportChoice } from './exportdialog';
export { documentTable, documentScene } from './documentdialog';
export { useOsmText } from './mapstage';

function applyTheme(theme: ThemeChoice): void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const dark = theme === 'dark' || (theme === 'system' && media.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

function renderStaticText(): void {
  const t = strings(state.prefs.lang);
  document.documentElement.lang = state.prefs.lang;
  el('app-name').textContent = t.appName;
  // The build version, injected at build time from the specification.
  el('app-version').textContent = `v${__APP_VERSION__}`;
  el('list-heading').textContent = t.listArea;
  el('map-heading').textContent = t.mapArea;
  el('map-load').textContent = t.mapLoad;
  for (const [id, label] of [
    ['map-zoom-in', t.mapZoomIn],
    ['map-zoom-out', t.mapZoomOut],
  ] as const) {
    el(id).setAttribute('aria-label', label);
    el(id).title = label;
  }
  el('map-fit').textContent = t.mapFit;
  el('map-reset').textContent = t.mapReset;
  el('map-empty-hint').textContent = t.mapEmptyHint;
  el('marker-remove').textContent = t.markerRemove;
  el('marker-shape-text').textContent = t.markerShape;
  el('work-save').textContent = t.workSave;
  el('work-share').textContent = t.workShare;
  el('area-panel-summary').textContent = t.areaPanel;
  el('area-panel-hint').textContent = t.areaPanelHint;
  el('area-new').setAttribute('aria-label', t.areaNew);
  el<HTMLInputElement>('area-new').placeholder = t.areaNew;
  el('area-add').textContent = t.vocabAdd;
  el('area-collect').textContent = t.areaCollect;
  el('program-panel-summary').textContent = t.programPanel;
  el('program-panel-hint').textContent = t.programPanelHint;
  el('program-new').setAttribute('aria-label', t.programNew);
  el<HTMLInputElement>('program-new').placeholder = t.programNew;
  el('program-add').textContent = t.vocabAdd;
  el('program-collect').textContent = t.areaCollect;
  el('event-panel-summary').textContent = t.eventPanel;
  el('event-panel-hint').textContent = t.eventPanelHint;
  el('event-date-new').setAttribute('aria-label', t.eventDate);
  el<HTMLInputElement>('event-date-new').placeholder = t.eventDatePlaceholder;
  el('event-label-new').setAttribute('aria-label', t.eventLabel);
  el<HTMLInputElement>('event-label-new').placeholder = t.eventLabel;
  el('event-add').textContent = t.vocabAdd;
  el('status-panel-summary').textContent = t.statusPanel;
  el('status-panel-hint').textContent = t.statusPanelHint;
  el('status-new').setAttribute('aria-label', t.statusNew);
  el<HTMLInputElement>('status-new').placeholder = t.statusNew;
  el('status-add').textContent = t.vocabAdd;
  el('symbols-from-status-label').textContent = t.symbolsFromStatus;
  el('symbols-from-status-hint').textContent = t.symbolsFromStatusHint;
  el('fetch-open').textContent = t.fetchOpen;
  el('fetch-offline').textContent = t.fetchOffline;
  el('fetch-heading').textContent = t.fetchHeading;
  el('fetch-badge').textContent = t.fetchBadge;
  el('fetch-notice').textContent = t.fetchNotice;
  el('fetch-mode-place-label').textContent = t.fetchModePlace;
  el('fetch-mode-bbox-label').textContent = t.fetchModeBbox;
  el('fetch-place').setAttribute('aria-label', t.fetchPlace);
  el<HTMLInputElement>('fetch-place').placeholder = t.fetchPlace;
  el('fetch-bbox-legend').textContent = t.fetchBboxLegend;
  el('fetch-bbox-help').textContent = t.fetchBboxHelp;
  el('fetch-bbox-example').textContent = t.fetchBboxExample;
  el('fetch-south-label').textContent = t.fetchSouth;
  el('fetch-west-label').textContent = t.fetchWest;
  el('fetch-north-label').textContent = t.fetchNorth;
  el('fetch-east-label').textContent = t.fetchEast;
  el('fetch-cancel').textContent = t.fetchCancel;
  el('fetch-search').textContent = t.fetchSearch;
  el('fetch-go').textContent = t.fetchGo;
  el('fetch-close').textContent = t.fetchClose;
  el('manual-start-hint').textContent = t.manualStartHint;
  el('start-empty').textContent = t.manualStartEmpty;
  el('load-demo').textContent = t.demoLoad;
  el('demo-hint').textContent = t.demoHint;
  el('manual-heading').textContent = t.manualHeading;
  el('add-row').textContent = t.manualAddRow;
  el('add-column').textContent = t.manualAddColumn;
  el('new-column-name').setAttribute('aria-label', t.manualColumnName);
  el<HTMLInputElement>('new-column-name').placeholder = t.manualColumnName;
  el('preset-heading').textContent = t.presetHeading;
  el('preset-select').setAttribute('aria-label', t.presetHeading);
  el('preset-apply').textContent = t.presetApply;
  el('preset-remove').textContent = t.presetRemove;
  el('preset-save').textContent = t.presetSave;
  el('preset-name').setAttribute('aria-label', t.presetName);
  el<HTMLInputElement>('preset-name').placeholder = t.presetName;
  el('work-open').textContent = t.workOpen;
  el('work-controls').setAttribute('aria-label', t.workGroup);
  renderWorkStatus();
  renderLegends();
  renderActivityDialog();
  el('visibility-heading').textContent = t.visibilityHeading;
  el('visibility-hint').textContent = t.visibilityHint;
  el('visibility-empty').textContent = t.visibilityEmpty;
  el('presentation-empty-hint').textContent = t.presentationEmptyHint;
  el('pres-fit').textContent = t.mapFit;
  el('pres-mode').setAttribute('aria-label', t.presentationViewGroup);
  el('pres-mode-map').textContent = t.presentationViewMap;
  el('pres-mode-timeline').textContent = t.presentationViewTimeline;
  el('pres-mode-costs').textContent = t.presentationViewCosts;
  el('pres-order-text').textContent = t.presentationOrder;
  const orderOptions = el<HTMLSelectElement>('pres-order').options;
  const orderLabels: Record<string, string> = { number: t.presentationOrderNumber, area: t.presentationOrderArea, start: t.presentationOrderStart };
  for (const option of orderOptions) {
    option.textContent = orderLabels[option.value] ?? option.textContent;
  }
  el('open-presentation').textContent = t.openPresentation;
  el('presentation-close').textContent = t.closePresentation;
  // The narrow viewer's toggle bar (FR-58).
  el('viewer-toggles').setAttribute('aria-label', t.viewerPanels);
  el('toggle-glance').textContent = t.viewerToggleGlance;
  el('toggle-legend').textContent = t.viewerToggleLegend;
  // The narrow application's toggle bars (FR-72).
  el('map-toggles').setAttribute('aria-label', t.viewerPanels);
  el('toggle-items').textContent = t.placementHeading;
  el('toggle-map-glance').textContent = t.viewerToggleGlance;
  el('toggle-map-legend').textContent = t.viewerToggleLegend;
  el('toggle-visibility').textContent = t.visibilityHeading;
  el('presentation-toggles').setAttribute('aria-label', t.viewerPanels);
  el('details-panel').setAttribute('aria-label', t.detailsPanel);
  el('export-open').textContent = t.exportOpen;
  el('pdf-open').textContent = t.pdfOpen;
  el('pptx-open').textContent = t.pptxOpen;
  renderDocument();
  el('export-heading').textContent = t.exportHeading;
  el('export-intro').textContent = t.exportIntro;
  el('export-contains-heading').textContent = t.exportContainsHeading;
  el('export-omitted-heading').textContent = t.exportOmittedHeading;
  el('export-go').textContent = t.exportGo;
  el('export-cancel').textContent = t.exportCancel;
  el('export-close').textContent = t.close;
  el('pres-reset').textContent = t.mapReset;
  for (const [id, label] of [
    ['pres-zoom-in', t.mapZoomIn],
    ['pres-zoom-out', t.mapZoomOut],
  ] as const) {
    el(id).setAttribute('aria-label', label);
    el(id).title = label;
  }
  el('pdf-heading').textContent = t.pdfHeading;
  el('pdf-page-label').textContent = t.pdfPage;
  el('pdf-use').textContent = t.pdfUse;
  el('pdf-cancel').textContent = t.pdfCancel;
  el('segment-nav').setAttribute('aria-label', t.segmentsLabel);
  el('tab-information').textContent = t.segmentInformation;
  el('tab-map').textContent = t.segmentMap;
  el('tab-presentation').textContent = t.segmentPresentation;
  el('presentation-heading').textContent = t.segmentPresentation;
  el('placement-heading').textContent = t.placementHeading;
  el('placement-hint').textContent = narrowApplication() ? t.placementHintNarrow : t.placementHint;
  el('place-cancel').textContent = t.placingCancel;
  renderPlacing();
  el('placement-empty').textContent = t.placementEmpty;
  el('label-language').textContent = t.language;
  el('label-theme').textContent = t.theme;
  el('drop-hint').textContent = t.dropHere;
  el('browse-button').textContent = t.browse;
  el('label-filter').textContent = t.filter;
  el('columns-summary').textContent = t.columns;
  el('select-all').textContent = t.selectAll;
  el('delete-selected').textContent = t.deleteSelected;
  el('no-file').textContent = t.noFileLoaded;
  el('empty-list').textContent = t.emptyList;
  el('counter-selected').textContent = `${t.selected}: ${state.selected.size}`;
  el('counter-retained').textContent = `${t.retained}: ${currentCounters().retained}`;
  el('counter-removed').textContent = `${t.removed}: ${currentCounters().removed}`;
  renderInformationTotals();
  const themeOptions = el<HTMLSelectElement>('select-theme').options;
  const themeLabels: Record<string, string> = { system: t.themeSystem, light: t.themeLight, dark: t.themeDark };
  for (const option of themeOptions) {
    option.textContent = themeLabels[option.value] ?? option.textContent;
  }
  const filterKind = el<HTMLSelectElement>('select-filter-kind');
  const options = filterKind.options;
  options[0].textContent = t.filterAll;
  options[1].textContent = t.filterEmpty;
  options[2].textContent = t.filterNonEmpty;
  options[3].textContent = t.filterContains;
}

function setLanguage(lang: Lang): void {
  state.prefs.lang = lang;
  followDemoLanguage(lang);
  // Choices made in the exported viewer are not remembered (FR-20).
  if (!state.viewOnly) {
    savePreferences(state.prefs);
  }
  el<HTMLSelectElement>('select-language').value = lang;
  renderStaticText();
  renderList();
  renderExport();
  renderViewerBadge();
}

function setTheme(theme: ThemeChoice): void {
  state.prefs.theme = theme;
  if (!state.viewOnly) {
    savePreferences(state.prefs);
  }
  el<HTMLSelectElement>('select-theme').value = theme;
  applyTheme(theme);
}

function initialisePreferences(): void {
  el<HTMLSelectElement>('select-language').value = state.prefs.lang;
  el<HTMLSelectElement>('select-theme').value = state.prefs.theme;
  applyTheme(state.prefs.theme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.prefs.theme === 'system') {
      applyTheme('system');
    }
  });
}

// The full-test demo (FR-41): the fictional example scenario, loaded through
// the normal paths: the demo's column preset is saved, the demo list is
// imported (so the preset applies the roles and vocabularies as it would to
// any matching import), the town map renders as an .osm background, and the
// scenario adds the colours, comments, and markers. It is unsaved work,
// labelled as example data until other work replaces it.
export let demoLoaded = false;
export function setDemoLoaded(value: boolean): void {
  demoLoaded = value;
}
let demoBaseline = -1;

// The language the demo's provided labels are in, and the demo's own
// annotations by their place in the scenario, so that the provided labels
// not renamed follow a change of language (FR-41 as amended).
let demoLang: Lang | null = null;
export function setDemoLang(value: Lang | null): void {
  demoLang = value;
}
let demoAnnotationIds: string[] = [];
export function setDemoAnnotationIds(value: string[]): void {
  demoAnnotationIds = value;
}
let demoEventIds: string[] = [];
export function setDemoEventIds(value: string[]): void {
  demoEventIds = value;
}

function samePreset(a: ColumnPreset, b: ColumnPreset): boolean {
  return JSON.stringify(clonePreset(a)) === JSON.stringify(clonePreset(b));
}

export async function loadDemo(options: { confirmed?: boolean } = {}): Promise<boolean> {
  const t = strings(state.prefs.lang);
  if (!options.confirmed && state.dirty && !window.confirm(t.demoConfirmReplace)) {
    return false;
  }
  // The demo loads in the interface language (FR-41 as amended).
  const lang = state.prefs.lang;
  const scenario = demoScenario(lang);
  // The session's own settings start afresh, so that the demo is pristine.
  state.excluded = new Set();
  state.positions = new Map();
  state.shapes = new Map();
  state.symbolLabels = {};
  state.numbering = 'global';
  state.listView = 'flat';
  state.detailsId = null;
  state.selectedMarker = null;
  state.presentationSelected = null;
  restoreTimelineView(null);
  restoreCostsView(null);
  state.events = [];
  setEventMessage('');
  // The demo's preset of another language, if unchanged, gives way to this
  // language's.
  for (const other of (['en', 'sv'] as const).filter((l) => l !== lang)) {
    const provided = demoScenario(other).preset;
    state.presets = state.presets.filter((p) => !(p.name === provided.name && samePreset(p, provided)));
  }
  state.presets = upsertPreset(state.presets, scenario.preset);
  storePresets(state.presets);
  el('ingest-error').classList.add('hidden');
  applyImport(parseWorkbook(demoWorkbook(lang)));
  state.symbolsFromStatus = scenario.symbolsFromStatus;
  const idKey = state.roles.identifier;
  const rowOf = (item: string) => (idKey === undefined ? undefined : state.rows.find((r) => r.values[idKey] === item));
  for (const item of scenario.items) {
    const row = rowOf(item.item);
    if (!row) {
      continue;
    }
    row.colour = item.colour;
    if (item.comments.length > 0) {
      state.comments.set(row, restoreComments(item.comments));
    }
    if (item.activities && item.activities.length > 0) {
      state.activities.set(
        row,
        item.activities.map((a, j) => ({ id: activityId(j), ...a })),
      );
    }
    if (item.workPhase !== undefined) {
      state.workPhases.set(row, item.workPhase);
    }
  }
  const outcome = await useOsmText(DEMO_MAP_TEXT);
  const bg = mapView?.background;
  if (outcome === 'ok' && bg) {
    for (const item of scenario.items) {
      const row = rowOf(item.item);
      if (!row || !item.position) {
        continue;
      }
      placeMarker(state.positions, row, { x: item.position[0] * bg.width, y: item.position[1] * bg.height });
      if (item.symbol) {
        state.shapes.set(row, item.symbol);
      }
    }
  }
  // The demo's own colour labels, at-a-glance columns, and annotations
  // (FR-41 as amended) replace any earlier ones.
  state.colourLabels = { ...scenario.colourLabels };
  state.glanceColumns = [...scenario.glanceColumns];
  state.annotations = [];
  state.annotationLinks = new Map();
  state.hiddenAnnotations = new Set();
  state.selectedAnnotation = null;
  demoAnnotationIds = [];
  if (outcome === 'ok' && bg) {
    for (const a of scenario.annotations) {
      const annotation: Annotation = {
        id: newAnnotationId(),
        kind: a.kind,
        points: a.points.map(([x, y]) => ({ x: x * bg.width, y: y * bg.height })),
        colour: a.colour,
        fillOpacity: a.fillOpacity,
        outline: a.outline,
        lineStyle: a.lineStyle,
        label: a.label,
      };
      state.annotations.push(annotation);
      demoAnnotationIds.push(annotation.id);
      const row = a.link === null ? undefined : rowOf(a.link);
      if (row) {
        state.annotationLinks.set(annotation.id, row);
      }
    }
  }
  // The demo's two fictional events (FR-41 as amended, FR-80).
  state.events = scenario.events.map((e, i) => ({ id: `e${i + 1}`, date: e.date, label: e.label }));
  demoEventIds = state.events.map((e) => e.id);
  demoLoaded = true;
  demoLang = lang;
  markDirty();
  demoBaseline = changeCount;
  setWorkMessage('demo-loaded');
  renderList();
  setSegment('map');
  return outcome === 'ok';
}

// A change of language while the demo is loaded (FR-41 as amended): each
// provided label the user has not renamed takes its counterpart in the new
// language: the colour labels, the area, program, and status values with the
// cells that hold them, and the annotation labels. What the user typed is kept as typed; the list's own headers and
// texts stay as loaded, and so does the preset, which matches the headers.
function followDemoLanguage(to: Lang): void {
  if (!demoLoaded || demoLang === null || demoLang === to) {
    return;
  }
  const c = demoCounterparts(demoLang, to);
  demoLang = to;
  let changed = false;
  for (const { colour, from, to: next } of c.colourLabels) {
    if (state.colourLabels[colour] !== from) {
      continue;
    }
    state.colourLabels[colour] = next;
    changed = true;
  }
  // A value follows unless its counterpart is already taken.
  const follow = (values: string[], pairs: Array<[string, string]>, key: string | undefined): Map<string, string> => {
    const renamed = new Map<string, string>();
    for (const [from, next] of pairs) {
      if (values.includes(from) && !values.includes(next)) {
        renamed.set(from, next);
      }
    }
    if (key !== undefined) {
      for (const row of state.ingested) {
        const next = renamed.get((row.values[key] ?? '').trim());
        if (next !== undefined) {
          row.values[key] = next;
        }
      }
    }
    if (renamed.size > 0) {
      changed = true;
    }
    return renamed;
  };
  const areas = follow(state.areaValues, c.areas, state.roles.area);
  state.areaValues = state.areaValues.map((v) => areas.get(v) ?? v);
  const programs = follow(state.programValues, c.programs, state.roles.program);
  state.programValues = state.programValues.map((v) => programs.get(v) ?? v);
  const statuses = follow(statusNames(state.statuses), c.statuses, state.roles.status);
  state.statuses = state.statuses.map((s) => ({ ...s, name: statuses.get(s.name) ?? s.name }));
  demoAnnotationIds.forEach((id, i) => {
    const annotation = state.annotations.find((a) => a.id === id);
    const [from, next] = c.annotationLabels[i];
    if (annotation && annotation.label === from) {
      annotation.label = next;
      changed = true;
    }
  });
  demoEventIds.forEach((id, i) => {
    const event = state.events.find((e) => e.id === id);
    const [from, next] = c.eventLabels[i];
    if (event && event.label === from) {
      event.label = next;
      changed = true;
    }
  });
  if (!changed) {
    return;
  }
  // The demo is as untouched as before: following the language is not a
  // change of the user's.
  const pristine = changeCount === demoBaseline;
  const message = workMessage;
  markDirty();
  if (pristine) {
    demoBaseline = changeCount;
    if (message === 'demo-loaded') {
      setWorkMessage(message);
    }
  }
}

// Reset demo (FR-56): after the unsaved-changes confirmation (asked only when
// the demo was changed), the session is discarded and the pristine demo is
// loaded in one step.
export async function resetDemo(): Promise<boolean> {
  if (!demoLoaded) {
    return false;
  }
  if (changeCount !== demoBaseline && !window.confirm(strings(state.prefs.lang).demoResetConfirm)) {
    return false;
  }
  return loadDemo({ confirmed: true });
}

export function exportPage(now: Date = new Date()): string | null {
  const page = selfPage();
  if (page === null) {
    return null;
  }
  // The static state and the notice in the export's language (FR-38 as
  // amended, FR-59).
  const t = strings(state.prefs.lang);
  const notice = [t.noticeTitle, t.noticeReason, fill(t.noticeRoutes, { address: HOSTED_ADDRESS, action: t.openPresentation }), t.noticeData];
  return embedDataIsland(writeStaticViewerState(page, state.prefs.lang, notice), serialiseExport(captureExport().data, now));
}

// Open presentation, read-only (FR-60): an exported presentation chosen by
// the user is shown in the viewer. The file is read locally; its HTML is
// parsed without running anything in it and only its data island is read,
// through the comparison's strict validation; its own program never runs.
// It replaces what is on screen, so unsaved work is asked about first;
// leaving starts the application afresh. Nothing is imported as work.
export const MAX_PRESENTATION_BYTES = 50 * 1024 * 1024;

export async function openPresentationFile(file: File): Promise<boolean> {
  if (state.viewOnly) {
    return false;
  }
  const t = strings(state.prefs.lang);
  if (file.size > MAX_PRESENTATION_BYTES) {
    reportOpenFailure(t.presentationTooLarge);
    return false;
  }
  let text: string;
  try {
    text = await readText(file);
  } catch {
    reportOpenFailure(t.workOpenUnreadable);
    return false;
  }
  const island = readDataIsland(new DOMParser().parseFromString(text, 'text/html'));
  if (island === null) {
    reportOpenFailure(t.compareNoData);
    return false;
  }
  try {
    parseExport(island);
  } catch (e) {
    if (!(e instanceof ExportError)) {
      throw e;
    }
    if (e.code === 'unknown-version') {
      reportOpenFailure(fill(t.compareUnknownVersion, { version: e.detail }));
    } else if (e.code === 'not-export') {
      reportOpenFailure(t.compareNoData);
    } else {
      reportOpenFailure(t.compareDamaged);
    }
    return false;
  }
  if (state.dirty && !window.confirm(t.presentationConfirmReplace)) {
    return false;
  }
  // What was on screen is given up: nothing is left to guard.
  state.dirty = false;
  state.viewOnly = true;
  state.segment = 'presentation';
  setComparison(null);
  openDetails(null);
  await startViewer(island);
  renderWorkStatus();
  el('presentation-close').classList.remove('hidden');
  return true;
}

export function setSegment(segment: Segment): void {
  // Drawing happens in the Map segment only (FR-47).
  if (segment !== 'map' && drawingTools && drawingTools.tool !== 'select') {
    setDrawingTool('select');
  }
  state.segment = segment;
  // An overlay of the narrow layout belongs to the segment it was opened in,
  // and so does a placement waiting for a tap.
  appNarrow?.close({ returnFocus: false });
  if (segment !== 'map') {
    stopPlacing();
  }
  showSegment(document, segment);
  if (segment === 'map') {
    mapView?.shown();
  }
  if (segment === 'presentation') {
    presentationView?.shown();
  }
  // A stage that changed size while hidden is refitted once shown (FR-71).
  if (narrowApplication()) {
    refitNarrowStages();
  }
  // Panels depend on the stage size, which is known only while it is shown.
  renderMapItems();
  renderDetailsPanel();
}

// Closing or reloading the page with unsaved work asks the browser to
// confirm. Nothing is ever written automatically: work reaches a file only
// through Save.
function guardUnsavedWork(e: BeforeUnloadEvent): void {
  if (!state.dirty) {
    return;
  }
  e.preventDefault();
  e.returnValue = '';
}

function wireEvents(): void {
  window.addEventListener('beforeunload', guardUnsavedWork);
  el('work-save').addEventListener('click', () => void saveWork());
  el('work-share').addEventListener('click', () => void shareWork());
  for (const kind of VALUE_VOCABULARIES) {
    el(`${kind}-add`).addEventListener('click', () => addVocabValue(kind));
    el(`${kind}-new`).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        addVocabValue(kind);
      }
    });
    el(`${kind}-collect`).addEventListener('click', () => collectVocabValues(kind));
  }
  el('event-add').addEventListener('click', addEvent);
  for (const id of ['event-date-new', 'event-label-new']) {
    el(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        addEvent();
      }
    });
  }
  const addStatusValue = () => {
    const input = el<HTMLInputElement>('status-new');
    const next = addStatus(state.statuses, input.value, DEFAULT_SHAPE);
    input.value = '';
    if (next !== state.statuses) {
      setStatuses(next);
    }
  };
  el('status-add').addEventListener('click', addStatusValue);
  el('symbols-from-status').addEventListener('change', (e) => setSymbolsFromStatus((e.target as HTMLInputElement).checked));
  el('status-new').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addStatusValue();
    }
  });
  el('start-empty').addEventListener('click', startEmptyList);
  el('load-demo').addEventListener('click', () => void loadDemo());
  const presentationInput = el<HTMLInputElement>('presentation-file-input');
  el('open-presentation').addEventListener('click', () => presentationInput.click());
  presentationInput.addEventListener('change', () => {
    const file = presentationInput.files?.[0];
    presentationInput.value = '';
    if (file) {
      void openPresentationFile(file);
    }
  });
  // Leaving a presentation opened in the application starts it afresh: the
  // work it replaced was given up when it opened (FR-60).
  el('presentation-close').addEventListener('click', () => window.location.reload());
  el('demo-reset').addEventListener('click', () => void resetDemo());
  el('add-row').addEventListener('click', addManualRow);
  el('add-column').addEventListener('click', addManualColumn);
  el('new-column-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      addManualColumn();
    }
  });
  const presetSelect = el<HTMLSelectElement>('preset-select');
  presetSelect.addEventListener('change', () => {
    el<HTMLButtonElement>('preset-apply').disabled = presetSelect.value === '';
    el<HTMLButtonElement>('preset-remove').disabled = presetSelect.value === '';
  });
  el('preset-apply').addEventListener('click', applySelectedPreset);
  el('preset-remove').addEventListener('click', removeSelectedPreset);
  el('preset-save').addEventListener('click', saveCurrentPreset);
  el('preset-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveCurrentPreset();
    }
  });
  const workInput = el<HTMLInputElement>('work-file-input');
  el('work-open').addEventListener('click', () => workInput.click());
  workInput.addEventListener('change', () => {
    const file = workInput.files?.[0];
    if (file) {
      void openWorkFile(file);
    }
    workInput.value = '';
  });
  el('segment-nav').addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLElement>('.segment-tab');
    if (tab && isSegment(tab.dataset.segment)) {
      setSegment(tab.dataset.segment);
    }
  });
  el('segment-nav').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') {
      return;
    }
    const index = SEGMENTS.indexOf(state.segment);
    const step = e.key === 'ArrowRight' ? 1 : SEGMENTS.length - 1;
    const next = SEGMENTS[(index + step) % SEGMENTS.length];
    setSegment(next);
    el(`tab-${next}`).focus();
  });
  el<HTMLSelectElement>('select-language').addEventListener('change', (e) => {
    setLanguage((e.target as HTMLSelectElement).value as Lang);
  });
  el<HTMLSelectElement>('select-theme').addEventListener('change', (e) => {
    setTheme((e.target as HTMLSelectElement).value as ThemeChoice);
  });

  const dropZone = el('drop-zone');
  const fileInput = el<HTMLInputElement>('file-input');
  el('browse-button').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) {
      void handleFile(file);
    }
    fileInput.value = '';
  });
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      void handleFile(file);
    }
  });

  const filterKind = el<HTMLSelectElement>('select-filter-kind');
  const filterText = el<HTMLInputElement>('filter-text');
  filterKind.addEventListener('change', () => {
    const kind = filterKind.value as ValueFilter['kind'];
    filterText.classList.toggle('hidden', kind !== 'contains');
    state.filter = { ...state.filter, kind, text: filterText.value };
    renderList();
  });
  el<HTMLSelectElement>('select-filter-column').addEventListener('change', (e) => {
    state.filter = { ...state.filter, header: (e.target as HTMLSelectElement).value };
    renderList();
  });
  filterText.addEventListener('input', () => {
    state.filter = { ...state.filter, text: filterText.value };
    renderList();
  });

  el('economics-overlay').addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') {
      return;
    }
    // The overlay closes alone: what is beneath it stays as it was.
    e.preventDefault();
    e.stopPropagation();
    closeEconomics();
  });
  el('card-fields-reset').addEventListener('click', () => {
    state.cardColumns = null;
    markDirty();
    renderList();
  });
  el<HTMLInputElement>('currency-unit').addEventListener('change', (e) => {
    state.currencyUnit = (e.target as HTMLInputElement).value.trim();
    markDirty();
    renderList();
  });
  el('glance-columns-reset').addEventListener('click', () => {
    state.glanceColumns = null;
    markDirty();
    renderList();
  });
  el('compare-close').addEventListener('click', closeComparison);
  el('compare-select-all').addEventListener('click', selectAllDiffering);
  el('compare-adopt').addEventListener('click', adoptPositions);
  el('details-panel').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      openDetails(null);
    }
  });
  el('list-view').addEventListener('change', (e) => setListView((e.target as HTMLSelectElement).value === 'grouped' ? 'grouped' : 'flat'));
  el('numbering-mode').addEventListener('change', (e) => setNumbering((e.target as HTMLSelectElement).value === 'grouped' ? 'grouped' : 'global'));
  el('select-all').addEventListener('click', selectAllVisible);
  el('delete-selected').addEventListener('click', deleteSelected);
}

// The exported viewer (FR-38): the same application, started on the data
// island of an exported file, in view-only mode. Only the Presentation
// segment is offered; the controls that edit, toggle visibility, open,
// save, or export are not shown and cannot be reached.
const VIEWER_HIDDEN = [
  'compare-panel',
  'activity-panel',
  'segment-nav',
  'work-controls',
  'export-separator',
  'export-open',
  'export-panel',
  'export-status',
  'pdf-open',
  'pptx-open',
  'document-panel',
  'document-status',
  'segment-information',
  'segment-map',
  'details-panel',
  'visibility-area',
];

async function startViewer(text: string): Promise<void> {
  document.documentElement.dataset.mode = 'viewer';
  for (const id of VIEWER_HIDDEN) {
    el(id).classList.add('hidden');
    el(id).inert = true;
    el(id).setAttribute('inert', '');
  }
  let data: ExportData;
  try {
    data = parseExport(text);
  } catch (e) {
    if (!(e instanceof ExportError)) {
      throw e;
    }
    el('presentation-empty-hint').textContent = strings(state.prefs.lang).viewerDamaged;
    el('presentation-empty').classList.add('error');
    return;
  }
  // The viewer opens in the exported language and theme (FR-20).
  state.prefs = { lang: data.lang, theme: data.theme };
  el<HTMLSelectElement>('select-language').value = data.lang;
  el<HTMLSelectElement>('select-theme').value = data.theme;
  applyTheme(data.theme);
  renderStaticText();
  setViewerView({ viewport: { ...data.workState.viewport }, ...(data.stage ? { stage: { ...data.stage } } : {}) });
  await applyWorkState(data.workState);
  state.numbers = new Map(state.ingested.map((row, i) => [row, data.numbers[i]]));
  const labels = data.labels;
  state.viewerLabels = labels ? new Map(state.ingested.map((row, i) => [row, labels[i]])) : null;
  state.viewerProgramGroups = data.programGroups ?? null;
  setWorkMessage(null);
  const badge = el('viewer-badge');
  badge.dataset.exportedAt = data.exportedAt;
  badge.classList.remove('hidden');
  renderViewerBadge();
  renderList();
  setSegment('presentation');
  // The application's overlays give way to the viewer's.
  appNarrow?.refresh();
  startNarrowViewer();
}

// The narrow viewer layout (FR-58), in the viewer only: active while its
// query matches. The stage's size at the last refit, so that a resize refits
// the view from it.
let narrow: NarrowViewer | null = null;
let narrowStage: { width: number; height: number } | null = null;

// Whether the presentation is in a narrow layout: the viewer's, or the
// application's (FR-71), which follows the viewer's patterns.
export function narrowViewer(): boolean {
  return (narrow?.active() ?? false) || narrowApplication();
}

export function closeNarrowOverlay(): void {
  narrow?.close({ returnFocus: false });
  appNarrow?.close({ returnFocus: false });
  narrowDialogs?.closeOpen();
}

// The six dialogs as overlays in the narrow layout (FR-71 and FR-72 as
// amended): shown and hidden through the manager, so that below
// the threshold they open over the stage -- one open at a time, focus moved
// in and returned, Escape and a tap outside closing -- and above the
// threshold they keep their page-flow shapes. The hidden class stays the
// dialogs' own open flag everywhere.
let narrowDialogs: NarrowDialogs | null = null;

export function showDialog(id: string): void {
  if (narrowDialogs?.active()) {
    narrowDialogs.closeOpen();
    closeNarrowOverlay();
    if (cardId !== null) {
      closeCard();
    }
    if (state.selectedAnnotation !== null) {
      selectAnnotation(null);
    }
    narrowDialogs.showing(id);
  }
  el(id).classList.remove('hidden');
}

export function hideDialog(id: string): void {
  el(id).classList.add('hidden');
  narrowDialogs?.hidden(id);
}

function dialogSpecs(): NarrowDialogSpec[] {
  return [
    {
      id: 'fetch-panel',
      kind: 'sheet',
      close: () => {
        fetchAbort?.abort();
        hideDialog('fetch-panel');
      },
    },
    { id: 'pdf-panel', kind: 'sheet', close: () => void closePdf() },
    { id: 'document-panel', kind: 'sheet', close: closeDocumentDialog },
    { id: 'export-panel', kind: 'page', close: closeExportDialog },
    { id: 'compare-panel', kind: 'page', close: closeComparison },
    { id: 'activity-panel', kind: 'page', close: closeActivityDialog },
  ];
}

// The narrow application layout (FR-71, FR-72): the application's own
// overlays, from the toggle bars of the Map and Presentation segments, one
// open at a time, gated on the application's mode, so that the viewer, when
// a presentation is opened in the application, has its own.
let appNarrow: NarrowViewer | null = null;

export function narrowApplication(): boolean {
  return appNarrow?.active() ?? false;
}

function startNarrowApplication(): void {
  appNarrow = new NarrowViewer(
    window.matchMedia(NARROW_QUERY),
    [
      { toggle: el<HTMLButtonElement>('menu-toggle'), panel: el('app-menu') },
      { toggle: el<HTMLButtonElement>('toggle-items'), panel: el('placement-area') },
      { toggle: el<HTMLButtonElement>('toggle-map-glance'), panel: el('map-glance') },
      { toggle: el<HTMLButtonElement>('toggle-map-legend'), panel: el('map-legend') },
      { toggle: el<HTMLButtonElement>('toggle-visibility'), panel: el('visibility-area') },
      { toggle: el<HTMLButtonElement>('toggle-glance'), panel: el('presentation-glance') },
      { toggle: el<HTMLButtonElement>('toggle-legend'), panel: el('presentation-legend') },
    ],
    {
      enabled: () => document.documentElement.dataset.mode !== 'viewer',
      // The card, the details sheet (FR-74), and the annotation inspector's
      // sheet take the overlays' place.
      closeCard: () => {
        if (cardId !== null) {
          closeCard();
        }
        if (state.detailsId !== null) {
          openDetails(null);
        }
        if (state.selectedAnnotation !== null) {
          selectAnnotation(null);
        }
        narrowDialogs?.closeOpen();
      },
      render: () => {
        layoutHeader();
        layoutAnnotationControls();
        renderMapItems();
        renderAnnotationInspector();
      },
      refit: () => refitNarrowStages(),
    },
  );
  layoutHeader();
  layoutAnnotationControls();
  // The six dialogs as overlays in the narrow layout (FR-71, FR-72 as
  // amended), on the same query and gate as the overlays.
  narrowDialogs = new NarrowDialogs(window.matchMedia(NARROW_QUERY), dialogSpecs(), {
    enabled: () => document.documentElement.dataset.mode !== 'viewer',
  });
  refitNarrowStages();
}

// The resize and orientation refit (FR-71), in the narrow layout only (the
// module calls it there only): each stage's size at its last refit, so that
// a fitted view stays fitted and another keeps its centre. A stage hidden
// in another segment has no size: it keeps its record, and is refitted when
// it is shown again.
const narrowStages = new Map<MapView, { width: number; height: number }>();

function refitNarrowStages(): void {
  for (const view of [mapView, presentationView]) {
    if (!view) {
      continue;
    }
    const now = view.stageSize();
    if (now.width <= 0 || now.height <= 0) {
      continue;
    }
    const before = narrowStages.get(view);
    if (before) {
      view.refit(before);
    }
    narrowStages.set(view, view.stageSize());
  }
  renderMapItems();
}

// The header's controls that the narrow layout moves into the Menu overlay
// (FR-71), each with an anchor marking its place in the header, so that
// leaving the narrow layout puts it back exactly where it was.
let headerAnchors: Array<{ item: HTMLElement; anchor: Comment }> | null = null;

function layoutHeader(): void {
  if (headerAnchors === null) {
    const items = [el('demo-badge'), el('demo-reset'), el('work-controls'), el('select-language').closest('label')!, el('select-theme').closest('label')!];
    headerAnchors = items.map((item) => {
      const anchor = document.createComment('menu');
      item.before(anchor);
      return { item, anchor };
    });
  }
  const menu = el('app-menu');
  if (narrowApplication()) {
    for (const { item } of headerAnchors) {
      if (item.parentElement !== menu) {
        menu.appendChild(item);
      }
    }
  } else {
    for (const { item, anchor } of headerAnchors) {
      if (item.previousSibling !== anchor) {
        anchor.after(item);
      }
    }
  }
}

// The four style controls of the annotation toolbar (FR-47 as amended in
// in the narrow layout they move into the inspector's bottom
// sheet, after its heading, so that the toolbar's single row keeps only the
// tools and the hint; above the threshold they sit in the toolbar as before.
// Each carries an anchor marking its place in the toolbar, so that leaving
// the narrow layout puts it back exactly where it was.
let annotationStyleAnchors: Array<{ item: HTMLElement; anchor: Comment }> | null = null;
let annotationStyleSheetAnchor: Comment | null = null;

function layoutAnnotationControls(): void {
  const toolbar = el('annotation-toolbar');
  if (annotationStyleAnchors === null) {
    const items = [...toolbar.querySelectorAll<HTMLElement>(':scope > label')];
    annotationStyleAnchors = items.map((item) => {
      const anchor = document.createComment('annotation-style');
      item.before(anchor);
      return { item, anchor };
    });
    const inspector = el('annotation-inspector');
    annotationStyleSheetAnchor = document.createComment('annotation-style');
    inspector.querySelector('#annotation-inspector-heading')!.after(annotationStyleSheetAnchor);
  }
  const inspector = el('annotation-inspector');
  if (narrowApplication()) {
    for (const { item } of annotationStyleAnchors) {
      if (item.parentElement !== inspector) {
        inspector.insertBefore(item, annotationStyleSheetAnchor);
      }
    }
  } else {
    for (const { item, anchor } of annotationStyleAnchors) {
      if (item.previousSibling !== anchor) {
        anchor.after(item);
      }
    }
  }
}

function startNarrowViewer(): void {
  narrowStage = presentationView?.stageSize() ?? null;
  narrow = new NarrowViewer(
    window.matchMedia(NARROW_QUERY),
    [
      { toggle: el<HTMLButtonElement>('toggle-glance'), panel: el('presentation-glance') },
      { toggle: el<HTMLButtonElement>('toggle-legend'), panel: el('presentation-legend') },
    ],
    {
      closeCard: () => {
        if (cardId !== null) {
          closeCard();
        }
      },
      render: () => renderPresentation(),
      refit: () => {
        if (!presentationView) {
          return;
        }
        const before = narrowStage;
        narrowStage = presentationView.stageSize();
        if (before) {
          presentationView.refit(before);
        }
        renderPresentation();
      },
    },
  );
}

function renderViewerBadge(): void {
  const badge = el('viewer-badge');
  const at = badge.dataset.exportedAt;
  if (!state.viewOnly || !at) {
    return;
  }
  badge.textContent = fill(strings(state.prefs.lang).viewerBadge, { date: formatCommentDate(at) });
}

export function main(): void {
  const island = readDataIsland(document);
  state.viewOnly = island !== null;
  if (state.viewOnly) {
    state.segment = 'presentation';
  }
  initialisePreferences();
  initialiseMapView();
  initialisePresentation();
  initialiseFetch();
  wireEvents();
  renderStaticText();
  renderMapItems();
  setSegment(state.segment);
  // The application's narrow layout (FR-71, FR-72); the exported viewer
  // starts its own.
  if (island === null) {
    startNarrowApplication();
  }
  if (island !== null) {
    void startViewer(island);
  }
  // The application has started: an exported file's static state and its
  // no-scripts notice give way (FR-38 as amended, FR-59).
  document.documentElement.dataset.started = 'true';
}

document.addEventListener('DOMContentLoaded', main);
