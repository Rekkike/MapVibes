import './polyfills';
import { selfPage } from './selfsource';
import { applyFilter, COLOURS, makeRow, numberRows, NO_FILTER, sortRows, type NumberedRow, type RowColour, type RowData, type ValueFilter } from './dataset';
import { importColumns, parseWorkbook, ParseError, type ParseResult } from './ingest';
import { columnLabel } from './columns';
import { emptyValues, newManualKey } from './manual';
import {
  addStatus,
  statusSymbol,
  addValue,
  collectValues,
  hasValue,
  mergeValues,
  moveStatus,
  removeStatus,
  removeValue,
  renameStatus,
  renameValue,
  setStatusSymbol,
  statusNames,
  type StatusEntry,
} from './vocab';
import { clonePreset, findMatchingPreset, presetConfiguration, presetMatches, removePreset, storePresets, upsertPreset, type ColumnPreset } from './presets';
import { assignRole, isRole, listColumnOrder, roleOfColumn, ROLES, type Role } from './roles';
import { strings, type Lang, type Strings } from './i18n';
import { savePreferences, type ThemeChoice } from './preferences';
import { MapView } from './mapview';
import { colourName, shapeName, type ColourLabels, type LegendGroup, type SymbolLabels } from './legend';
import { formatCommentDate, restoreComments } from './comments';
import { drawSymbol, isSymbol, SYMBOLS, symbolClasses, type MarkerSymbol } from './symbols';
import { DEFAULT_SHAPE, placeMarker } from './markers';
import { isSegment, SEGMENTS, showSegment, type Segment } from './segments';
import { activityId, type StoredEvent } from './workstate';
import { ExportError, parseExport, serialiseExport, type ExportData } from './exportfile';
import { embedDataIsland, readDataIsland, writeStaticViewerState } from './singlefile';
import { HOSTED_ADDRESS } from './hosted';
import { areaGroups, programLabels } from './grouping';
import { DEMO_MAP_TEXT, demoCounterparts, demoScenario, demoWorkbook } from './demo';
import { NARROW_QUERY, NarrowDialogs, NarrowViewer, type NarrowDialogSpec } from './narrowviewer';
import { readDate } from './dates';
import { DEFAULT_CURRENCY_UNIT, proposeSeries, SERIES_ROLES, seriesKey, type SeriesAssignments, type SeriesProposal, type SeriesRole } from './economics';
import { newAnnotationId, type Annotation } from './annotations';
import { currentCounters, el, fill, rowId, state } from './appstate';
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
import {
  adoptPositions,
  captureExport,
  closeComparison,
  closeExportDialog,
  keptSeries,
  renderComparison,
  renderExport,
  selectAllDiffering,
  setComparison,
} from './exportdialog';
import { closeActivityDialog, renderActivityDialog } from './activitydialog';
import { openDetails, renderDetailsPanel } from './detailspanel';
import { drawingTools, renderAnnotationInspector, renderAnnotationToolbar, selectAnnotation, setDrawingTool } from './annotationpanel';
import { closePdf, initialiseMapView, itemLabel, mapView, renderMapItems, renderPlacing, stopPlacing, useOsmText } from './mapstage';
import {
  cardId,
  closeCard,
  closeEconomics,
  initialisePresentation,
  presentationView,
  renderCardFieldPicker,
  renderEconomicsOverlay,
  renderGlanceColumnPicker,
  renderInformationTotals,
  renderLegends,
  renderPresentation,
  restoreCostsView,
  restoreTimelineView,
  setViewerView,
} from './presentationstage';
export { ROW_DRAG_TYPE } from './appstate';
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

// Import cap (FR-1 and FR-25): a spreadsheet or PDF file larger than this is
// refused before it is read, mirroring the OpenStreetMap and presentation-open
// caps.
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

// Direct import (FR-1): the list is populated immediately with every column
// of the file. Importing over unsaved work asks for confirmation first, as
// opening a work-state file does.
async function handleFile(file: File): Promise<void> {
  const errorEl = el('ingest-error');
  errorEl.classList.add('hidden');
  if (file.size > MAX_IMPORT_BYTES) {
    errorEl.textContent = strings(state.prefs.lang).spreadsheetTooLarge;
    errorEl.classList.remove('hidden');
    return;
  }
  let parse: ParseResult;
  try {
    parse = parseWorkbook(await file.arrayBuffer());
  } catch (e) {
    const t = strings(state.prefs.lang);
    const detail = e instanceof ParseError && e.message ? e.message : '';
    errorEl.textContent = detail ? `${t.parseError} ${detail}` : t.parseError;
    errorEl.classList.remove('hidden');
    return;
  }
  if (state.dirty && !window.confirm(strings(state.prefs.lang).importConfirmReplace)) {
    return;
  }
  applyImport(parse);
}

function applyImport(parse: ParseResult): void {
  const { headers, rows } = importColumns(parse);
  resetList(headers, rows);
  const preset = findMatchingPreset(state.presets, headers);
  if (preset) {
    applyPreset(preset, 'auto');
  }
  renderList();
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
let demoAnnotationIds: string[] = [];
let demoEventIds: string[] = [];

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
  eventMessage = '';
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

// Starts an empty list with no import (FR-30); rows and columns are then
// added by hand.
// Starts an empty list (FR-30) with four starter columns, named in the
// interface language and assigned the name, start, end, and note roles by
// key (hard constraint 5: the labels are interface text that no logic reads;
// the columns are ordinary manual columns, freely renamed or removed).
function startEmptyList(): void {
  const t = strings(state.prefs.lang);
  if (state.dirty && !window.confirm(t.manualConfirmReplace)) {
    return;
  }
  el('ingest-error').classList.add('hidden');
  resetList([], []);
  const starters: Array<[string, Role]> = [
    [t.starterName, 'name'],
    [t.starterStart, 'start'],
    [t.starterEnd, 'end'],
    [t.starterNote, 'note'],
  ];
  for (const [label, role] of starters) {
    const key = newManualKey(state.headers);
    state.manualColumns.set(key, label);
    state.headers = [...state.headers, key];
    state.roles = { ...state.roles, [role]: key };
  }
  state.visibleHeaders = [...state.headers];
  renderList();
}

function resetList(headers: string[], rows: Record<string, string>[]): void {
  // A new list discards the demo's provided colour labels along with the demo
  // (FR-41 as amended), and starts with no at-a-glance choice: a
  // choice belongs to the list it was made on (FR-46 as amended).
  if (demoLoaded) {
    state.colourLabels = {};
  }
  state.glanceColumns = null;
  // A new list opens the timeline and the costs view at their fitted views
  // (FR-67, FR-79), and discards the demo's provided events with the demo
  // (FR-80); events the user authored are the work's own and stay.
  restoreTimelineView(null);
  restoreCostsView(null);
  if (demoLoaded) {
    state.events = [];
  }
  demoEventIds = [];
  // The card fields and the series name columns of the list they were made
  // on, and the unit belongs to that work (FR-62 to FR-64).
  state.cardColumns = null;
  state.series = {};
  state.currencyUnit = DEFAULT_CURRENCY_UNIT;
  demoLoaded = false;
  demoLang = null;
  demoAnnotationIds = [];
  state.headers = headers;
  state.roles = {};
  state.manualColumns = new Map();
  state.manualRows = new Set();
  state.comments = new Map();
  state.edited = new Map();
  state.ingested = rows.map((values) => makeRow(values));
  state.rows = [...state.ingested];
  state.hiddenHeaders = new Set();
  state.filter = { ...NO_FILTER };
  state.sort = { header: null, direction: 'asc' };
  state.selected = new Set();
  state.visibleHeaders = [...headers];
  el<HTMLSelectElement>('select-filter-kind').value = 'all';
  el<HTMLInputElement>('filter-text').classList.add('hidden');
  state.activePreset = null;
  presetMessage = null;
  markDirty();
  el('list-panel').classList.remove('hidden');
  el('no-file').classList.add('hidden');
}

// The header text shown for a column: a manual column's own label, or the
// file's header.
export function labelOf(key: string): string {
  const t = strings(state.prefs.lang);
  const manual = state.manualColumns.get(key);
  if (manual !== undefined) {
    return manual.trim() === '' ? t.untitledHeader : manual;
  }
  return columnLabel(key, t.untitledHeader);
}

// Adds a row by hand (FR-9): it is appended, so it takes the next number,
// and is coloured, placed, removed, and renumbered like any imported row.
function addManualRow(): void {
  const row = makeRow(emptyValues(state.headers));
  state.ingested.push(row);
  state.rows.push(row);
  state.manualRows.add(row);
  markDirty();
  renderList();
  // Focus the new row's first editable cell, if any.
  const id = rowId(row);
  document.querySelector<HTMLInputElement>(`#row-table-body tr[data-row-id="${id}"] .cell-input`)?.focus();
}

// Adds a column by hand (FR-24): every row gets an empty value; the column
// then takes part in sorting, filtering, roles, presets, and visibility.
function addManualColumn(): void {
  const input = el<HTMLInputElement>('new-column-name');
  const label = input.value.trim();
  if (label === '') {
    return;
  }
  const key = newManualKey(state.headers);
  state.manualColumns.set(key, label);
  state.headers = [...state.headers, key];
  state.visibleHeaders = [...state.headers];
  for (const row of state.ingested) {
    row.values[key] = '';
  }
  input.value = '';
  markDirty();
  renderList();
}

function renameManualColumn(key: string, label: string): void {
  if (!state.manualColumns.has(key) || label.trim() === '') {
    return;
  }
  state.manualColumns.set(key, label.trim());
  markDirty();
  renderList();
}

// Every value is edited by hand (FR-10), imported values included, in the
// list and in the details panel; an edit is an unsaved change. The cells of
// the area column are choose-from comboboxes and those of the status column
// choose from the status list (FR-32, FR-33).
function setCellValue(row: RowData, key: string, value: string): void {
  if (key === state.roles.area || key === state.roles.program) {
    value = value.trim();
  }
  if (row.values[key] === value) {
    return;
  }
  noteEdit(row, key, value);
  // A new value typed into the area column joins the area vocabulary.
  if (key === state.roles.area) {
    state.areaValues = addValue(state.areaValues, value);
  }
  if (key === state.roles.program) {
    state.programValues = addValue(state.programValues, value);
  }
  row.values[key] = value;
  markDirty();
  renderList();
}

// The grouped numbering applies while it is chosen and the area role is
// assigned (FR-17); without the area role the global numbering applies and
// the list says why.
export function groupedNumbering(): boolean {
  return state.numbering === 'grouped' && state.roles.program !== undefined;
}

// The numbered rows (FR-3, FR-17): the global sequential numbers, shown as
// such or as grouped numbers; in the exported viewer the numbers of the
// exported presentation (FR-38). One source for the list, the markers, and
// every panel.
export function numbered(): NumberedRow[] {
  const numbers = state.numbers;
  if (numbers !== null) {
    return state.rows.map((row, i) => {
      const number = numbers.get(row) ?? i + 1;
      return { row, number, label: state.viewerLabels?.get(row) ?? String(number) };
    });
  }
  const rows = numberRows(state.rows);
  if (!groupedNumbering()) {
    return rows;
  }
  const labels = programLabels(state.rows, state.roles.program!, state.programValues);
  return rows.map((n) => ({ ...n, label: labels.get(n.row) ?? n.label }));
}

// The number of a row as shown.
export function numberLabel(row: RowData): string {
  return numbered().find((n) => n.row === row)?.label ?? String(state.rows.indexOf(row) + 1);
}

function displayedRows(): NumberedRow[] {
  let rows = numbered();
  if (state.sort.header) {
    const sorted = sortRows(state.rows, state.sort.header, state.sort.direction);
    const byRow = new Map(rows.map((n) => [n.row, n]));
    rows = sorted.map((row) => byRow.get(row)!);
  }
  return applyFilter(rows, state.filter);
}

// The sections of the list (FR-17): the whole list in the flat view; in the
// grouped view one section per area group holding rows after filtering, in
// the order of the groups, each keeping the list's sort order.
interface ListSection {
  // The area value ('' for the items without one), or null in the flat view.
  area: string | null;
  index: number;
  rows: NumberedRow[];
  collapsed: boolean;
}

function groupedView(): boolean {
  return state.listView === 'grouped' && state.roles.area !== undefined;
}

function listSections(): ListSection[] {
  const rows = displayedRows();
  if (!groupedView()) {
    return [{ area: null, index: 0, rows, collapsed: false }];
  }
  return areaGroups(state.rows, state.roles.area!, state.areaValues)
    .map((group) => {
      const members = new Set(group.rows);
      return { area: group.area, index: group.index, rows: rows.filter((n) => members.has(n.row)), collapsed: state.collapsedAreas.has(group.area) };
    })
    .filter((section) => section.rows.length > 0);
}

// The heading row of a section, with the control that collapses and
// expands it.
function sectionRow(section: ListSection, span: number, t: Strings): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'group-row';
  tr.dataset.area = section.area ?? '';
  const th = document.createElement('th');
  th.colSpan = span;
  th.scope = 'rowgroup';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'group-toggle';
  toggle.setAttribute('aria-expanded', section.collapsed ? 'false' : 'true');
  const name = section.area === '' ? t.numberingNoArea : section.area!;
  const label = document.createElement('span');
  label.className = 'group-name';
  label.textContent = name;
  const count = document.createElement('span');
  count.className = 'group-count';
  count.textContent = fill(t.listGroupCount, { count: section.rows.length });
  toggle.append(label, count);
  toggle.setAttribute('aria-label', `${section.collapsed ? t.listGroupExpand : t.listGroupCollapse}: ${name}`);
  toggle.addEventListener('click', () => {
    const area = section.area ?? '';
    if (state.collapsedAreas.has(area)) {
      state.collapsedAreas.delete(area);
    } else {
      state.collapsedAreas.add(area);
    }
    renderList();
  });
  th.appendChild(toggle);
  tr.appendChild(th);
  return tr;
}

function setListView(view: 'flat' | 'grouped'): void {
  state.listView = view;
  renderList();
}

// The role explanation (FR-55): what each role feeds, and which column holds
// it now, so that a role left unassigned explains itself.
function roleLabel(t: Strings, role: Role): string {
  return {
    identifier: t.roleIdentifier,
    name: t.roleName,
    start: t.roleStart,
    end: t.roleEnd,
    area: t.roleArea,
    status: t.roleStatus,
    program: t.roleProgram,
    note: t.roleNote,
  }[role];
}

const ROLE_HELP: Record<Role, keyof Strings> = {
  identifier: 'roleHelpIdentifier',
  name: 'roleHelpName',
  start: 'roleHelpStart',
  end: 'roleHelpEnd',
  area: 'roleHelpArea',
  status: 'roleHelpStatus',
  program: 'roleHelpProgram',
  note: 'roleHelpNote',
};

function renderRoleHelp(): void {
  const t = strings(state.prefs.lang);
  el('role-help-summary').textContent = t.roleHelpSummary;
  el('role-help-intro').textContent = t.roleHelpIntro;
  el('role-help-list').replaceChildren(
    ...ROLES.map((role) => {
      const li = document.createElement('li');
      li.dataset.role = role;
      const name = document.createElement('strong');
      name.textContent = roleLabel(t, role);
      const what = document.createElement('span');
      what.className = 'role-help-text';
      what.textContent = ` ${t[ROLE_HELP[role]]}`;
      const key = state.roles[role];
      const status = document.createElement('span');
      status.className = `role-help-status${key === undefined ? ' is-missing' : ''}`;
      status.textContent = ` ${key === undefined ? t.roleHelpUnassigned : fill(t.roleHelpAssigned, { column: labelOf(key) })}`;
      li.append(name, what, status);
      return li;
    }),
  );
}

// Year series and series roles (FR-63): the proposals, from the headers'
// year tokens, and the user's assignments. An assigned series follows its
// proposal's current columns, so that a year column added later belongs to
// it; a column that merely holds a year is never used unless assigned.
function seriesProposals(): SeriesProposal[] {
  return proposeSeries(state.headers.map((key) => ({ key, label: labelOf(key) })));
}

export function effectiveSeries(): SeriesAssignments {
  const proposals = seriesProposals();
  const out: SeriesAssignments = {};
  for (const role of SERIES_ROLES) {
    const a = state.series[role];
    if (!a) {
      continue;
    }
    const proposal = proposals.find((p) => p.key === seriesKey(a.name));
    const columns = proposal ? { ...proposal.columns } : Object.fromEntries(Object.entries(a.columns).filter(([, k]) => state.headers.includes(k)));
    const total = a.total !== null && state.headers.includes(a.total) ? a.total : null;
    if (Object.keys(columns).length > 0 || total !== null) {
      out[role] = { name: proposal?.name ?? a.name, columns, total };
    }
  }
  return out;
}

function seriesRoleOf(proposalKey: string): SeriesRole | null {
  return SERIES_ROLES.find((r) => state.series[r] && seriesKey(state.series[r].name) === proposalKey) ?? null;
}

// One series per role: assigning a role moves it from any other series.
function setSeriesRole(proposal: SeriesProposal, role: SeriesRole | null): void {
  const next: SeriesAssignments = {};
  for (const r of SERIES_ROLES) {
    const a = state.series[r];
    if (a && seriesKey(a.name) !== proposal.key && r !== role) {
      next[r] = a;
    }
  }
  if (role) {
    next[role] = { name: proposal.name, columns: { ...proposal.columns }, total: null };
  }
  state.series = next;
  markDirty();
  renderList();
}

function setSeriesTotal(role: SeriesRole, key: string | null): void {
  const a = state.series[role];
  if (!a) {
    return;
  }
  state.series = { ...state.series, [role]: { ...a, total: key } };
  markDirty();
  renderList();
}

function seriesRoleLabel(t: Strings, role: SeriesRole): string {
  return { budget: t.seriesRoleBudget, forecast: t.seriesRoleForecast, outcome: t.seriesRoleOutcome }[role];
}

function renderSeriesPanel(): void {
  const t = strings(state.prefs.lang);
  el('series-panel-summary').textContent = t.seriesPanel;
  el('series-panel-hint').textContent = t.seriesPanelHint;
  el('currency-unit-label').textContent = t.currencyUnit;
  el('currency-unit-hint').textContent = t.currencyUnitHint;
  const unit = el<HTMLInputElement>('currency-unit');
  if (document.activeElement !== unit) {
    unit.value = state.currencyUnit;
  }
  const proposals = seriesProposals();
  el('series-none').textContent = t.seriesNone;
  el('series-none').classList.toggle('hidden', proposals.length > 0);
  const inSeries = new Set(proposals.flatMap((p) => Object.values(p.columns)));
  el('series-list').replaceChildren(
    ...proposals.map((proposal) => {
      const li = document.createElement('li');
      li.className = 'vocab-item series-item';
      li.dataset.series = proposal.key;
      const name = document.createElement('strong');
      name.className = 'series-name';
      name.textContent = proposal.name;
      const years = Object.keys(proposal.columns)
        .map(Number)
        .sort((a, b) => a - b);
      const span = document.createElement('span');
      span.className = 'series-years';
      span.textContent = fill(t.seriesYears, { first: years[0], last: years[years.length - 1], count: years.length });
      const role = document.createElement('select');
      role.className = 'series-role';
      role.dataset.series = proposal.key;
      role.setAttribute('aria-label', fill(t.seriesRoleFor, { series: proposal.name }));
      for (const value of ['', ...SERIES_ROLES] as const) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value === '' ? t.seriesRoleNone : seriesRoleLabel(t, value);
        role.appendChild(option);
      }
      const assigned = seriesRoleOf(proposal.key);
      role.value = assigned ?? '';
      role.addEventListener('change', () => setSeriesRole(proposal, (role.value || null) as SeriesRole | null));
      li.append(name, span, role);
      if (assigned) {
        // The optional total column: any column outside the year series.
        const total = document.createElement('select');
        total.className = 'series-total';
        total.dataset.series = proposal.key;
        total.setAttribute('aria-label', fill(t.seriesTotalFor, { series: proposal.name }));
        const none = document.createElement('option');
        none.value = '';
        none.textContent = t.seriesTotalNone;
        total.appendChild(none);
        for (const key of listColumnOrder(state.headers, state.roles).filter((k) => !inSeries.has(k))) {
          const option = document.createElement('option');
          option.value = key;
          option.textContent = labelOf(key);
          total.appendChild(option);
        }
        total.value = state.series[assigned]!.total ?? '';
        total.addEventListener('change', () => setSeriesTotal(assigned, total.value || null));
        li.appendChild(total);
      }
      return li;
    }),
  );
}

export function renderList(): void {
  const t = strings(state.prefs.lang);
  const head = el('row-table-head');
  const body = el('row-table-body');
  head.innerHTML = '';
  body.innerHTML = '';

  // One heading cell per body column: the row-selection column first.
  const selectTh = document.createElement('th');
  selectTh.className = 'select-column';
  const selectLabel = document.createElement('span');
  selectLabel.className = 'visually-hidden';
  selectLabel.textContent = t.selectColumn;
  selectTh.appendChild(selectLabel);
  head.appendChild(selectTh);

  const numberTh = document.createElement('th');
  numberTh.textContent = t.numberColumn;
  head.appendChild(numberTh);

  const columns = listColumnOrder(state.headers, state.roles);
  const roleLabels = Object.fromEntries(ROLES.map((r) => [r, roleLabel(t, r)])) as Record<Role, string>;
  renderRoleHelp();
  renderSeriesPanel();
  columns.forEach((header) => {
    const th = document.createElement('th');
    const labelText = labelOf(header);
    const role = roleOfColumn(state.roles, header);
    th.className = 'sortable';
    th.dataset.header = header;
    if (state.hiddenHeaders.has(header)) {
      th.classList.add('hidden');
    }
    if (role) {
      th.dataset.role = role;
    }
    if (state.sort.header === header) {
      th.dataset.sort = state.sort.direction;
    }
    // Sorting by the column heading; the role control sits below it.
    const sortButton = document.createElement('button');
    sortButton.type = 'button';
    sortButton.className = 'sort-button';
    const label = document.createElement('span');
    label.className = 'column-label';
    label.textContent = labelText;
    sortButton.appendChild(label);
    sortButton.addEventListener('click', () => {
      if (state.sort.header === header) {
        state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort = { header, direction: 'asc' };
      }
      renderList();
    });
    // Role assignment in the list (FR-1).
    const roleSelect = document.createElement('select');
    roleSelect.className = 'role-select';
    roleSelect.dataset.header = header;
    roleSelect.setAttribute('aria-label', `${t.role}: ${labelText}`);
    const none = document.createElement('option');
    none.value = '';
    none.textContent = t.roleNone;
    roleSelect.appendChild(none);
    for (const r of ROLES) {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = roleLabels[r];
      roleSelect.appendChild(opt);
    }
    roleSelect.value = role ?? '';
    roleSelect.addEventListener('change', () => {
      setColumnRole(header, isRole(roleSelect.value) ? roleSelect.value : null);
    });
    th.append(sortButton, roleSelect);
    // A manual column's name is edited in its heading (FR-24).
    const manualLabel = state.manualColumns.get(header);
    if (manualLabel !== undefined) {
      th.dataset.manual = 'true';
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'column-name-input';
      nameInput.value = manualLabel;
      nameInput.dataset.header = header;
      nameInput.setAttribute('aria-label', `${t.manualRenameColumn}: ${labelText}`);
      nameInput.addEventListener('change', () => renameManualColumn(header, nameInput.value));
      th.appendChild(nameInput);
    }
    head.appendChild(th);
  });

  const colourTh = document.createElement('th');
  colourTh.textContent = t.colour;
  head.appendChild(colourTh);

  const sections = listSections();
  const rows = sections.flatMap((section) => (section.collapsed ? [] : section.rows));
  const renderRow = ({ row, label: number }: NumberedRow) => {
    const tr = document.createElement('tr');
    const id = rowId(row);
    tr.dataset.rowId = id;
    if (state.manualRows.has(row)) {
      tr.dataset.manual = 'true';
    }
    if (state.selected.has(id)) {
      tr.dataset.selected = 'true';
    }

    const selectTd = document.createElement('td');
    const selectInput = document.createElement('input');
    selectInput.type = 'checkbox';
    selectInput.className = 'row-select';
    selectInput.dataset.rowId = id;
    selectInput.checked = state.selected.has(id);
    selectInput.addEventListener('change', () => {
      if (selectInput.checked) {
        state.selected.add(id);
      } else {
        state.selected.delete(id);
      }
      el('counter-selected').textContent = `${strings(state.prefs.lang).selected}: ${state.selected.size}`;
    });
    selectTd.appendChild(selectInput);

    const numTd = document.createElement('td');
    numTd.className = 'num';
    const detailsButton = document.createElement('button');
    detailsButton.type = 'button';
    detailsButton.className = 'row-details';
    detailsButton.textContent = String(number);
    detailsButton.setAttribute('aria-label', `${t.detailsShow}: ${itemLabel(row, number)}`);
    detailsButton.title = t.detailsShow;
    detailsButton.addEventListener('click', () => openDetails(id, true));
    numTd.appendChild(detailsButton);
    tr.append(selectTd, numTd);
    if (state.detailsId === id) {
      tr.dataset.details = 'true';
    }
    // A click on a line, away from its controls, selects it for the
    // details panel (FR-16).
    tr.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.row-select, .row-details, .colour-chip')) {
        return;
      }
      if (state.detailsId !== id) {
        openDetails(id);
      }
    });
    // Moving through the cells by keyboard keeps an open panel on the line.
    tr.addEventListener('focusin', (e) => {
      if (state.detailsId !== null && state.detailsId !== id && (e.target as HTMLElement).classList.contains('cell-input')) {
        openDetails(id);
      }
    });

    columns.forEach((header) => {
      const td = document.createElement('td');
      if (header === state.roles.status) {
        td.appendChild(statusCell(row, header, number));
        td.classList.add('editable');
      } else {
        td.appendChild(valueInput(row, header, number));
        td.classList.add('editable');
      }
      td.dataset.header = header;
      if (header === state.roles.name) {
        td.classList.add('primary-label');
      }
      if (state.hiddenHeaders.has(header)) {
        td.classList.add('hidden');
      }
      tr.appendChild(td);
    });

    const colourTd = document.createElement('td');
    const chip = document.createElement('span');
    chip.className = `colour-chip ${row.colour}`;
    chip.title = colourLabel(row.colour);
    chip.setAttribute('aria-label', `${t.colour}: ${colourLabel(row.colour)}`);
    chip.dataset.rowId = id;
    chip.addEventListener('click', () => {
      const idx = COLOURS.indexOf(row.colour);
      row.colour = COLOURS[(idx + 1) % COLOURS.length];
      markDirty();
      renderList();
    });
    colourTd.appendChild(chip);
    tr.appendChild(colourTd);
    body.appendChild(tr);
  };
  for (const section of sections) {
    if (section.area !== null) {
      body.appendChild(sectionRow(section, columns.length + 3, t));
    }
    if (!section.collapsed) {
      section.rows.forEach(renderRow);
    }
  }

  const allSelected = rows.length > 0 && rows.every(({ row }) => state.selected.has(rowId(row)));
  const selectAllInput = el<HTMLButtonElement>('select-all');
  selectAllInput.textContent = t.selectAll;
  el('delete-selected').textContent = t.deleteSelected;
  selectAllInput.dataset.allSelected = allSelected ? 'true' : 'false';

  renderMapItems();
  renderWorkStatus();

  // A collapsed section is still a shown section.
  el('empty-list').classList.toggle(
    'hidden',
    sections.some((section) => section.rows.length > 0),
  );
  el('counter-selected').textContent = `${t.selected}: ${state.selected.size}`;
  el('counter-retained').textContent = `${t.retained}: ${currentCounters().retained}`;
  el('counter-removed').textContent = `${t.removed}: ${currentCounters().removed}`;
  renderInformationTotals();

  renderFilterColumnSelect();
  renderColumnVisibility();
  renderPresets();
  for (const kind of VALUE_VOCABULARIES) {
    renderVocabPanel(kind);
  }
  renderEventPanel();
  renderColourPanel();
  renderSymbolPanel();
  renderGlanceColumnPicker();
  renderCardFieldPicker();
  renderEconomicsOverlay();
  renderAnnotationToolbar();
  renderAnnotationInspector();
  renderStatusPanel();
  renderLegends();
  renderNumbering();
  renderDetailsPanel();
  renderComparison();
}

function renderFilterColumnSelect(): void {
  const select = el<HTMLSelectElement>('select-filter-column');
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = strings(state.prefs.lang).columnHeader;
  select.appendChild(placeholder);
  state.headers.forEach((header) => {
    const opt = document.createElement('option');
    opt.value = header;
    opt.textContent = labelOf(header);
    select.appendChild(opt);
  });
  select.value = state.headers.includes(state.filter.header) ? state.filter.header : '';
  state.filter.header = select.value;
}

function renderColumnVisibility(): void {
  const container = el('column-visibility');
  container.innerHTML = '';
  state.headers.forEach((header) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'column-visible';
    input.dataset.header = header;
    input.checked = !state.hiddenHeaders.has(header);
    input.addEventListener('change', () => {
      if (input.checked) {
        state.hiddenHeaders.delete(header);
      } else {
        state.hiddenHeaders.add(header);
      }
      renderList();
    });
    label.append(input, document.createTextNode(labelOf(header)));
    container.appendChild(label);
  });
}

function deleteSelected(): void {
  const toRemove = new Set(state.selected);
  const before = state.rows.length;
  state.rows = state.rows.filter((r) => !toRemove.has(rowId(r)));
  state.selected = new Set();
  if (state.rows.length !== before) {
    markDirty();
  }
  renderList();
}

function selectAllVisible(): void {
  const rows = listSections().flatMap((section) => (section.collapsed ? [] : section.rows));
  const allSelected = rows.every(({ row }) => state.selected.has(rowId(row)));
  if (allSelected) {
    rows.forEach(({ row }) => state.selected.delete(rowId(row)));
  } else {
    rows.forEach(({ row }) => state.selected.add(rowId(row)));
  }
  renderList();
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

// The column whose value names an item in the placement list: the column
// assigned the identifier role, otherwise the first kept column.
// Column presets (FR-23).
let presetMessage: { kind: 'auto' | 'applied' | 'saved' | 'removed'; name: string } | null = null;
export function setPresetMessage(value: { kind: 'auto' | 'applied' | 'saved' | 'removed'; name: string } | null): void {
  presetMessage = value;
}

function applyPreset(preset: ColumnPreset, kind: 'auto' | 'applied'): void {
  const config = presetConfiguration(preset, state.headers);
  state.hiddenHeaders = new Set(config.hidden);
  state.roles = config.roles;
  if (preset.areas) {
    state.areaValues = [...preset.areas];
  }
  if (preset.programs) {
    state.programValues = [...preset.programs];
  }
  if (preset.statuses) {
    state.statuses = preset.statuses.map((s) => ({ ...s }));
  }
  if (preset.cardColumns) {
    state.cardColumns = preset.cardColumns.filter((k) => state.headers.includes(k));
  }
  if (preset.series) {
    state.series = keptSeries(preset.series, (k) => state.headers.includes(k));
  }
  if (preset.currencyUnit !== undefined) {
    state.currencyUnit = preset.currencyUnit;
  }
  state.activePreset = preset.name;
  presetMessage = { kind, name: preset.name };
}

function applySelectedPreset(): void {
  const preset = state.presets.find((p) => p.name === el<HTMLSelectElement>('preset-select').value);
  if (!preset) {
    return;
  }
  applyPreset(preset, 'applied');
  markDirty();
  renderList();
}

function saveCurrentPreset(): void {
  const t = strings(state.prefs.lang);
  const input = el<HTMLInputElement>('preset-name');
  const name = input.value.trim();
  if (name === '' || state.headers.length === 0) {
    return;
  }
  if (state.presets.some((p) => p.name === name) && !window.confirm(t.presetConfirmReplace.replace('{name}', name))) {
    return;
  }
  state.presets = upsertPreset(state.presets, {
    name,
    headers: [...state.headers],
    hidden: state.headers.filter((h) => state.hiddenHeaders.has(h)),
    roles: { ...state.roles },
    areas: [...state.areaValues],
    programs: [...state.programValues],
    statuses: state.statuses.map((s) => ({ ...s })),
    ...(state.cardColumns ? { cardColumns: [...state.cardColumns] } : {}),
    series: effectiveSeries(),
    currencyUnit: state.currencyUnit,
  });
  storePresets(state.presets);
  state.activePreset = name;
  presetMessage = { kind: 'saved', name };
  input.value = '';
  markDirty();
  renderList();
}

function removeSelectedPreset(): void {
  const t = strings(state.prefs.lang);
  const name = el<HTMLSelectElement>('preset-select').value;
  if (!state.presets.some((p) => p.name === name)) {
    return;
  }
  if (!window.confirm(t.presetConfirmRemove.replace('{name}', name))) {
    return;
  }
  state.presets = removePreset(state.presets, name);
  storePresets(state.presets);
  if (state.activePreset === name) {
    state.activePreset = null;
  }
  presetMessage = { kind: 'removed', name };
  markDirty();
  renderList();
}

function renderPresets(): void {
  const t = strings(state.prefs.lang);
  const select = el<HTMLSelectElement>('preset-select');
  const previous = select.value;
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = state.presets.length === 0 ? t.presetNone : t.presetChoose;
  select.appendChild(placeholder);
  for (const preset of state.presets) {
    const opt = document.createElement('option');
    const matches = presetMatches(preset, state.headers);
    opt.value = preset.name;
    opt.textContent = matches ? preset.name : `${preset.name} (${t.presetOtherColumns})`;
    opt.dataset.matches = matches ? 'true' : 'false';
    select.appendChild(opt);
  }
  const wanted = state.activePreset ?? previous;
  select.value = state.presets.some((p) => p.name === wanted) ? wanted : '';
  select.disabled = state.presets.length === 0;
  el<HTMLButtonElement>('preset-apply').disabled = select.value === '';
  el<HTMLButtonElement>('preset-remove').disabled = select.value === '';
  el<HTMLButtonElement>('preset-save').disabled = state.headers.length === 0;
  const messages = { auto: t.presetAutoApplied, applied: t.presetApplied, saved: t.presetSaved, removed: t.presetRemoved };
  el('preset-status').textContent = presetMessage ? messages[presetMessage.kind].replace('{name}', presetMessage.name) : '';
}

// An imported value changed by hand keeps its imported value on record
// (FR-10); changing it back clears the record. Values of rows or columns
// added by hand were never imported.
function noteEdit(row: RowData, key: string, value: string): void {
  if (state.manualRows.has(row) || state.manualColumns.has(key)) {
    return;
  }
  const record = { ...(state.edited.get(row) ?? {}) };
  const imported = key in record ? record[key] : (row.values[key] ?? '');
  if (value === imported) {
    delete record[key];
  } else {
    record[key] = imported;
  }
  if (Object.keys(record).length === 0) {
    state.edited.delete(row);
  } else {
    state.edited.set(row, record);
  }
}

// Marks a control whose imported value was edited by hand.
function markEdited(control: HTMLElement, row: RowData, key: string, t: Strings): void {
  const record = state.edited.get(row);
  if (!record || !(key in record)) {
    return;
  }
  control.classList.add('edited');
  control.dataset.edited = 'true';
  control.title = record[key] === '' ? t.valueEditedEmpty : t.valueEdited.replace('{value}', record[key]);
}

// The editing control of one value: a text field, a combobox in the area
// column (FR-32). The status column has its own list (statusCell).
function valueInput(row: RowData, key: string, number: string): HTMLInputElement {
  const t = strings(state.prefs.lang);
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'cell-input';
  input.value = row.values[key] ?? '';
  input.dataset.header = key;
  input.setAttribute('aria-label', `${labelOf(key)}, ${t.numberColumn} ${number}`);
  input.addEventListener('change', () => setCellValue(row, key, input.value));
  const vocab = vocabularyOfColumn(key);
  if (vocab !== null) {
    input.setAttribute('list', `${vocab}-values`);
    input.classList.add('combobox');
    const value = (row.values[key] ?? '').trim();
    if (value !== '' && !hasValue(vocabValues(vocab), value)) {
      input.classList.add('not-in-vocabulary');
      input.title = t.vocabNotInList;
    }
  }
  markEdited(input, row, key, t);
  return input;
}

// The editing control of one value in the details panel. In the narrow
// layout (FR-74), a plain text value is edited in a field that wraps and
// grows to its content, so that a value is shown in full, as touch has no
// tooltips; it stays one line of text: Enter commits it, and line breaks
// pasted into it become spaces. A value with a list of its own keeps the
// list's field.
export function detailValueInput(row: RowData, key: string, number: string): HTMLElement {
  if (!narrowApplication() || vocabularyOfColumn(key) !== null) {
    return valueInput(row, key, number);
  }
  const t = strings(state.prefs.lang);
  const area = document.createElement('textarea');
  area.className = 'cell-input wraps';
  area.rows = 1;
  area.value = row.values[key] ?? '';
  area.dataset.header = key;
  area.setAttribute('aria-label', `${labelOf(key)}, ${t.numberColumn} ${number}`);
  area.addEventListener('input', () => {
    if (/[\r\n]/.test(area.value)) {
      area.value = area.value.replace(/\s*[\r\n]+\s*/g, ' ');
    }
    fitToContent(area);
  });
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      area.blur();
    }
  });
  area.addEventListener('change', () => setCellValue(row, key, area.value));
  markEdited(area, row, key, t);
  return area;
}

// A wrapping field as tall as its content.
export function fitToContent(area: HTMLTextAreaElement): void {
  area.style.height = 'auto';
  // The content's height and the borders around it.
  if (area.scrollHeight > 0) {
    area.style.height = `${area.scrollHeight + area.offsetHeight - area.clientHeight}px`;
  }
}

// A cell of the status column (FR-33): chosen from the status list. A value
// that is not in the list is kept and shown as such until another is chosen.
export function statusCell(row: RowData, key: string, number: string): HTMLSelectElement {
  const t = strings(state.prefs.lang);
  const select = document.createElement('select');
  select.className = 'cell-input status-select';
  select.dataset.header = key;
  select.setAttribute('aria-label', `${labelOf(key)}, ${t.numberColumn} ${number}`);
  const current = (row.values[key] ?? '').trim();
  const none = document.createElement('option');
  none.value = '';
  none.textContent = t.statusNone;
  select.appendChild(none);
  for (const status of state.statuses) {
    const opt = document.createElement('option');
    opt.value = status.name;
    opt.textContent = status.name;
    select.appendChild(opt);
  }
  if (current !== '' && !statusNames(state.statuses).includes(current)) {
    const opt = document.createElement('option');
    opt.value = current;
    opt.textContent = `${current} (${t.vocabNotInListShort})`;
    select.appendChild(opt);
    select.classList.add('not-in-vocabulary');
    select.title = t.vocabNotInList;
  }
  select.value = current;
  select.addEventListener('change', () => setCellValue(row, key, select.value));
  markEdited(select, row, key, t);
  return select;
}

// The symbol shown for an item's marker (FR-26, FR-34): a symbol chosen
// manually for the marker always wins. Otherwise, only while the user has
// switched on "assign marker symbols from status", the symbol of the item's
// status applies; else the default symbol.
export function symbolSource(row: RowData): 'manual' | 'status' | 'default' {
  if (state.shapes.has(row)) {
    return 'manual';
  }
  return statusSymbolOf(row) !== null ? 'status' : 'default';
}

function statusSymbolOf(row: RowData): MarkerSymbol | null {
  const key = state.roles.status;
  if (!state.symbolsFromStatus || key === undefined) {
    return null;
  }
  const symbol = statusSymbol(state.statuses, row.values[key] ?? '');
  return symbol !== null && isSymbol(symbol) ? symbol : null;
}

export function symbolOf(row: RowData): MarkerSymbol {
  return state.shapes.get(row) ?? statusSymbolOf(row) ?? DEFAULT_SHAPE;
}

export function effectiveSymbols(): Map<RowData, MarkerSymbol> {
  return new Map(state.rows.map((row) => [row, symbolOf(row)]));
}

function setSymbolsFromStatus(on: boolean): void {
  state.symbolsFromStatus = on;
  markDirty();
  renderList();
}

// Editable colour labels (FR-45): the user's name for a colour, or the
// colour's own name in the interface language.
export function colourLabel(colour: RowColour): string {
  const label = (state.colourLabels[colour] ?? '').trim();
  return label !== '' ? label : colourName(strings(state.prefs.lang), colour);
}

export function colourLabels(): ColourLabels {
  return { green: colourLabel('green'), blue: colourLabel('blue'), yellow: colourLabel('yellow'), red: colourLabel('red') };
}

// Editable symbol labels (FR-54): the user's name for a symbol, or its name
// in the interface language.
export function symbolLabel(symbol: MarkerSymbol): string {
  const label = (state.symbolLabels[symbol] ?? '').trim();
  return label !== '' ? label : shapeName(strings(state.prefs.lang), symbol);
}

export function symbolLabels(): SymbolLabels {
  return Object.fromEntries(SYMBOLS.map((s) => [s, symbolLabel(s)])) as SymbolLabels;
}

function setSymbolLabel(symbol: MarkerSymbol, label: string): void {
  const value = label.trim();
  if ((state.symbolLabels[symbol] ?? '') === value) {
    return;
  }
  if (value === '') {
    delete state.symbolLabels[symbol];
  } else {
    state.symbolLabels[symbol] = value;
  }
  markDirty();
  renderList();
}

function renderSymbolPanel(): void {
  const t = strings(state.prefs.lang);
  el('symbol-panel-summary').textContent = t.symbolPanel;
  el('symbol-panel-hint').textContent = t.symbolPanelHint;
  const list = el('symbol-label-list');
  const focused =
    document.activeElement instanceof HTMLInputElement && list.contains(document.activeElement) ? document.activeElement.dataset.symbol : undefined;
  list.innerHTML = '';
  for (const symbol of SYMBOLS) {
    const li = document.createElement('li');
    li.className = 'vocab-item symbol-label-item';
    li.dataset.symbol = symbol;
    const swatch = document.createElement('span');
    swatch.className = `legend-swatch ${symbolClasses(symbol)}`;
    swatch.setAttribute('aria-hidden', 'true');
    drawSymbol(swatch, symbol, '');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'vocab-name symbol-label-input';
    input.dataset.symbol = symbol;
    input.value = state.symbolLabels[symbol] ?? '';
    input.placeholder = shapeName(t, symbol);
    input.setAttribute('aria-label', fill(t.symbolLabelFor, { symbol: shapeName(t, symbol) }));
    input.addEventListener('change', () => setSymbolLabel(symbol, input.value));
    li.append(swatch, input);
    list.appendChild(li);
  }
  if (focused) {
    list.querySelector<HTMLInputElement>(`input[data-symbol="${focused}"]`)?.focus();
  }
}

function setColourLabel(colour: RowColour, label: string): void {
  const value = label.trim();
  if ((state.colourLabels[colour] ?? '') === value) {
    return;
  }
  if (value === '') {
    delete state.colourLabels[colour];
  } else {
    state.colourLabels[colour] = value;
  }
  markDirty();
  renderList();
}

function renderColourPanel(): void {
  const t = strings(state.prefs.lang);
  el('colour-panel-summary').textContent = t.colourPanel;
  el('colour-panel-hint').textContent = t.colourPanelHint;
  const list = el('colour-label-list');
  const focused =
    document.activeElement instanceof HTMLInputElement && list.contains(document.activeElement) ? document.activeElement.dataset.colour : undefined;
  list.innerHTML = '';
  for (const colour of COLOURS) {
    const li = document.createElement('li');
    li.className = 'vocab-item colour-label-item';
    li.dataset.colour = colour;
    const swatch = document.createElement('span');
    swatch.className = `legend-swatch marker-${colour} marker-shape-circle`;
    swatch.setAttribute('aria-hidden', 'true');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'vocab-name colour-label-input';
    input.dataset.colour = colour;
    input.value = state.colourLabels[colour] ?? '';
    input.placeholder = colourName(t, colour);
    input.setAttribute('aria-label', fill(t.colourLabelFor, { colour: colourName(t, colour) }));
    input.addEventListener('change', () => setColourLabel(colour, input.value));
    li.append(swatch, input);
    list.appendChild(li);
  }
  if (focused) {
    list.querySelector<HTMLInputElement>(`input[data-colour="${focused}"]`)?.focus();
  }
}

// The programs behind the grouped numbers shown (FR-17), read from the labels
// themselves, so that the exported viewer shows them as well.
export function shownProgramGroups(): LegendGroup[] {
  if (state.viewerProgramGroups) {
    return state.viewerProgramGroups.map((g) => ({ ...g }));
  }
  const programKey = state.roles.program;
  if (programKey === undefined) {
    return [];
  }
  const groups = new Map<number, string>();
  for (const { row, label } of numbered()) {
    const match = /^(\d+)\.\d+$/.exec(label);
    if (match && !groups.has(Number(match[1]))) {
      groups.set(Number(match[1]), (row.values[programKey] ?? '').trim());
    }
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([index, name]) => ({ index, name }));
}

function setNumbering(mode: 'global' | 'grouped'): void {
  state.numbering = mode;
  renderList();
}

function renderNumbering(): void {
  const t = strings(state.prefs.lang);
  el('numbering-text').textContent = t.numberingLabel;
  const select = el<HTMLSelectElement>('numbering-mode');
  select.options[0].textContent = t.numberingGlobal;
  select.options[1].textContent = t.numberingGrouped;
  select.value = state.numbering;
  const view = el<HTMLSelectElement>('list-view');
  el('list-view-text').textContent = t.listViewLabel;
  view.options[0].textContent = t.listViewFlat;
  view.options[1].textContent = t.listViewGrouped;
  view.value = state.listView;
  // The grouped numbering needs the program role; the grouped view, the area
  // role (FR-17).
  const notices: string[] = [];
  if (state.numbering === 'grouped' && state.roles.program === undefined) {
    notices.push(t.numberingNeedsProgram);
  }
  if (state.listView === 'grouped' && state.roles.area === undefined) {
    notices.push(t.listViewNeedsArea);
  }
  el('numbering-notice').textContent = notices.join(' ');
  el('numbering-notice').classList.toggle('hidden', notices.length === 0);
  const groups = groupedNumbering() ? shownProgramGroups() : [];
  el('numbering-groups').textContent =
    groups.length > 0 ? `${t.numberingGroups} ${groups.map((g) => `${g.index}. ${g.name}`).join(' · ')}; ${t.numberingUnprogrammed}` : '';
  el('numbering-groups').classList.toggle('hidden', groups.length === 0);
}

// The status vocabulary panel (FR-33).
function setStatuses(next: StatusEntry[]): void {
  state.statuses = next;
  markDirty();
  renderList();
}

function renameStatusValue(from: string, to: string): void {
  const result = renameStatus(state.statuses, from, to);
  if (!result.renamed) {
    renderList();
    return;
  }
  // Cells holding the old status follow the rename.
  const key = state.roles.status;
  if (key !== undefined) {
    for (const row of state.ingested) {
      if ((row.values[key] ?? '').trim() === from) {
        row.values[key] = result.name;
      }
    }
  }
  setStatuses(result.statuses);
}

function symbolSelect(value: string, label: string, onChange: (symbol: string) => void): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'status-symbol';
  select.setAttribute('aria-label', label);
  for (const symbol of SYMBOLS) {
    const opt = document.createElement('option');
    opt.value = symbol;
    opt.textContent = symbolLabel(symbol);
    select.appendChild(opt);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function renderStatusPanel(): void {
  const t = strings(state.prefs.lang);
  const list = el('status-list');
  list.innerHTML = '';
  state.statuses.forEach((status, index) => {
    const li = document.createElement('li');
    li.className = 'vocab-item';
    li.dataset.status = status.name;
    const swatch = document.createElement('span');
    swatch.className = `legend-swatch ${symbolClasses(status.symbol as MarkerSymbol)}`;
    swatch.setAttribute('aria-hidden', 'true');
    drawSymbol(swatch, status.symbol as MarkerSymbol, '');
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'vocab-name';
    name.value = status.name;
    name.setAttribute('aria-label', `${t.vocabRename}: ${status.name}`);
    name.addEventListener('change', () => renameStatusValue(status.name, name.value));
    const symbol = symbolSelect(status.symbol, `${t.statusSymbol}: ${status.name}`, (v) => setStatuses(setStatusSymbol(state.statuses, status.name, v)));
    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'vocab-up icon-button';
    up.textContent = '↑';
    up.title = t.vocabMoveUp;
    up.setAttribute('aria-label', `${t.vocabMoveUp}: ${status.name}`);
    up.disabled = index === 0;
    up.addEventListener('click', () => setStatuses(moveStatus(state.statuses, status.name, -1)));
    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'vocab-down icon-button';
    down.textContent = '↓';
    down.title = t.vocabMoveDown;
    down.setAttribute('aria-label', `${t.vocabMoveDown}: ${status.name}`);
    down.disabled = index === state.statuses.length - 1;
    down.addEventListener('click', () => setStatuses(moveStatus(state.statuses, status.name, 1)));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'vocab-remove';
    remove.textContent = t.vocabRemove;
    remove.setAttribute('aria-label', `${t.vocabRemove}: ${status.name}`);
    remove.addEventListener('click', () => setStatuses(removeStatus(state.statuses, status.name)));
    li.append(swatch, name, symbol, up, down, remove);
    list.appendChild(li);
  });
  el('status-status').textContent = state.statuses.length === 0 ? t.vocabEmpty : '';
  el<HTMLInputElement>('symbols-from-status').checked = state.symbolsFromStatus;
}

// The area vocabulary panel (FR-32).
// The user-managed value vocabularies of the area (FR-32) and program
// (FR-43) columns: one implementation for both, so that they cannot drift.
type ValueVocabulary = 'area' | 'program';
const VALUE_VOCABULARIES: ValueVocabulary[] = ['area', 'program'];
const vocabMessages: Record<ValueVocabulary, string> = { area: '', program: '' };

function vocabValues(kind: ValueVocabulary): string[] {
  return kind === 'area' ? state.areaValues : state.programValues;
}

function vocabularyOfColumn(key: string): ValueVocabulary | null {
  return VALUE_VOCABULARIES.find((kind) => state.roles[kind] === key) ?? null;
}

function setVocabValues(kind: ValueVocabulary, next: string[], message = ''): void {
  if (kind === 'area') {
    state.areaValues = next;
  } else {
    state.programValues = next;
  }
  vocabMessages[kind] = message;
  markDirty();
  renderList();
}

function renameVocabValue(kind: ValueVocabulary, from: string, to: string): void {
  const before = vocabValues(kind);
  const { list, renamed } = renameValue(before, from, to);
  if (!renamed) {
    renderList();
    return;
  }
  // Cells holding the old value follow the rename.
  const key = state.roles[kind];
  if (key !== undefined) {
    for (const row of state.ingested) {
      if ((row.values[key] ?? '').trim() === from) {
        row.values[key] = list[before.indexOf(from)];
      }
    }
  }
  setVocabValues(kind, list);
}

function collectVocabValues(kind: ValueVocabulary): void {
  const t = strings(state.prefs.lang);
  const key = state.roles[kind];
  if (key === undefined) {
    return;
  }
  const before = vocabValues(kind).length;
  const next = mergeValues(vocabValues(kind), collectValues(state.rows, key));
  setVocabValues(kind, next, fill(t.vocabCollected, { count: next.length - before }));
}

function addVocabValue(kind: ValueVocabulary): void {
  const input = el<HTMLInputElement>(`${kind}-new`);
  const before = vocabValues(kind);
  const next = addValue(before, input.value);
  input.value = '';
  if (next !== before) {
    setVocabValues(kind, next);
  }
}

function renderVocabPanel(kind: ValueVocabulary): void {
  const t = strings(state.prefs.lang);
  const values = vocabValues(kind);
  const list = el(`${kind}-list`);
  list.innerHTML = '';
  for (const value of values) {
    const li = document.createElement('li');
    li.className = 'vocab-item';
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'vocab-name';
    name.value = value;
    name.setAttribute('aria-label', `${t.vocabRename}: ${value}`);
    name.addEventListener('change', () => renameVocabValue(kind, value, name.value));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'vocab-remove';
    remove.textContent = t.vocabRemove;
    remove.setAttribute('aria-label', `${t.vocabRemove}: ${value}`);
    remove.addEventListener('click', () => setVocabValues(kind, removeValue(vocabValues(kind), value)));
    li.append(name, remove);
    list.appendChild(li);
  }
  const datalist = el(`${kind}-values`);
  datalist.innerHTML = '';
  for (const value of values) {
    const opt = document.createElement('option');
    opt.value = value;
    datalist.appendChild(opt);
  }
  el<HTMLButtonElement>(`${kind}-collect`).disabled = state.roles[kind] === undefined;
  el(`${kind}-status`).textContent = values.length === 0 && !vocabMessages[kind] ? t.vocabEmpty : vocabMessages[kind];
}

// The events panel (FR-80): global dated markers, hand-authored in the
// vocabulary pattern -- add with a date and a label, list with rename and
// remove. Nothing is inferred: the date is kept as typed and read by the
// shared date reader (FR-68); one that cannot be read is kept, said to be
// unreadable, and not drawn.
let eventMessage = '';
export function setEventMessage(value: string): void {
  eventMessage = value;
}

function newEventId(): string {
  const used = new Set(state.events.map((e) => e.id));
  let n = state.events.length + 1;
  while (used.has(`e${n}`)) {
    n++;
  }
  return `e${n}`;
}

function setEvents(next: StoredEvent[], message = ''): void {
  state.events = next;
  eventMessage = message;
  markDirty();
  renderList();
  if (state.segment === 'presentation') {
    renderPresentation();
  }
}

function addEvent(): void {
  const t = strings(state.prefs.lang);
  const date = el<HTMLInputElement>('event-date-new');
  const label = el<HTMLInputElement>('event-label-new');
  const d = date.value.trim();
  const l = label.value.trim();
  if (d === '' || l === '') {
    eventMessage = t.eventNeedsBoth;
    renderEventPanel();
    return;
  }
  date.value = '';
  label.value = '';
  setEvents([...state.events, { id: newEventId(), date: d, label: l }], readDate(d).kind === 'date' ? '' : t.eventUnreadable);
}

function renderEventPanel(): void {
  const t = strings(state.prefs.lang);
  const list = el('event-list');
  list.innerHTML = '';
  for (const event of state.events) {
    const li = document.createElement('li');
    li.className = 'vocab-item event-item';
    li.dataset.eventId = event.id;
    const readable = readDate(event.date).kind === 'date';
    const date = document.createElement('input');
    date.type = 'text';
    date.className = 'vocab-name event-date';
    date.value = event.date;
    date.setAttribute('aria-label', `${t.eventDate}: ${event.label}`);
    if (!readable) {
      date.classList.add('not-in-vocabulary');
      date.title = t.eventUnreadable;
    }
    date.addEventListener('change', () => {
      const next = date.value.trim();
      // An emptied date is not a date: the entry keeps the one it had.
      if (next === '' || next === event.date) {
        return renderEventPanel();
      }
      setEvents(
        state.events.map((e) => (e.id === event.id ? { ...e, date: next } : e)),
        readDate(next).kind === 'date' ? '' : t.eventUnreadable,
      );
    });
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'vocab-name event-label';
    name.value = event.label;
    name.setAttribute('aria-label', `${t.vocabRename}: ${event.label}`);
    name.addEventListener('change', () => {
      const next = name.value.trim();
      if (next === '' || next === event.label) {
        return renderEventPanel();
      }
      setEvents(state.events.map((e) => (e.id === event.id ? { ...e, label: next } : e)));
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'vocab-remove';
    remove.textContent = t.vocabRemove;
    remove.setAttribute('aria-label', `${t.vocabRemove}: ${event.label}`);
    remove.addEventListener('click', () => setEvents(state.events.filter((e) => e.id !== event.id)));
    li.append(date, name, remove);
    list.appendChild(li);
  }
  el('event-status').textContent = state.events.length === 0 && !eventMessage ? t.vocabEmpty : eventMessage;
}

function setColumnRole(header: string, role: Role | null): void {
  state.roles = assignRole(state.roles, header, role);
  markDirty();
  renderList();
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
