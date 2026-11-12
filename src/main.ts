import './polyfills';
import { selfPage } from './selfsource';
import { applyFilter, COLOURS, makeRow, numberRows, NO_FILTER, sortRows, type NumberedRow, type RowColour, type RowData, type ValueFilter } from './dataset';
import { importColumns, parseWorkbook, ParseError, type ParseResult } from './ingest';
import { columnLabel } from './columns';
import { emptyValues, newManualKey } from './manual';
import {
  addStatus,
  normalise,
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
import { assignRole, displayName, isRole, listColumnOrder, roleOfColumn, ROLES, type Role } from './roles';
import { format, strings, type Lang, type Strings } from './i18n';
import { savePreferences, type ThemeChoice } from './preferences';
import { MapView } from './mapview';
import { isPdfFile, openPdf, type PdfDocument } from './pdfbackground';
import { isOsmFile, MAX_OSM_BYTES, OsmError, parseOsm, planRender, type MercatorProjection, type OsmBounds } from './osm';
import { renderPlanToDataUrl } from './osmrender';
import { MarkerLayer } from './markerlayer';
import { colourName, renderLegend, shapeName, type ColourLabels, type LegendGroup, type LegendUse, type SeriesLegend, type SymbolLabels } from './legend';
import { formatCommentDate, restoreComments } from './comments';
import { renderCard as renderCardContent } from './details';
import { drawSymbol, isSymbol, SYMBOLS, symbolClasses, type MarkerSymbol } from './symbols';
import { markersInView } from './glance';
import { DEFAULT_SHAPE, placedMarkers, placeMarker, pruneMarkers, removeMarker, type PlacedMarker } from './markers';
import { BUTTON_ZOOM_FACTOR, imageToScreen, screenToImage, type Point, type Viewport } from './viewport';
import { isSegment, SEGMENTS, showSegment, type Segment } from './segments';
import { activityId, type PresentationMode, type PresentationOrder, type StoredEvent, type TimelineWindow } from './workstate';
import {
  buildCosts,
  buildTimeline,
  inThousands,
  orderEntries,
  startDay,
  type CostsItem,
  type ScheduleEvent,
  type TimelineItem,
  type TimelineLine,
} from './timeline';
import { TimelineView, type TimelineLabels } from './timelineview';
import { ExportError, parseExport, serialiseExport, type ExportData } from './exportfile';
import { embedDataIsland, readDataIsland, writeStaticViewerState } from './singlefile';
import { HOSTED_ADDRESS } from './hosted';
import { areaGroups, programLabels } from './grouping';
import { DEMO_MAP_TEXT, demoCounterparts, demoScenario, demoWorkbook } from './demo';
import { NARROW_QUERY, NarrowDialogs, NarrowViewer, type NarrowDialogSpec } from './narrowviewer';
import { formatAmount, renderEconomics } from './economicsview';
import { formatDate, readDate } from './dates';
import { todayDay } from './clock';
import {
  DEFAULT_CURRENCY_UNIT,
  readAmount,
  economicsOf,
  informationTotals,
  proposeSeries,
  SERIES_ROLES,
  seriesKey,
  yearOfValue,
  type Economics,
  type SeriesAssignments,
  type SeriesProposal,
  type SeriesRole,
} from './economics';
import {
  formatArea,
  newAnnotationId,
  LINE_STYLES,
  OUTLINES,
  trueArea,
  type Annotation,
  type AnnotationKind,
  type AnnotationStyle,
  type LineStyle,
  type Outline,
} from './annotations';
import { AnnotationLayer, DrawingTools, type DrawingTool } from './annotationlayer';
import { currentCounters, el, fill, ROW_DRAG_TYPE, rowById, rowId, state } from './appstate';
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
import { closeDocumentDialog, openDocumentDialog, renderDocument, runDocumentExport } from './documentdialog';
import {
  adoptPositions,
  captureExport,
  closeComparison,
  closeExportDialog,
  keptSeries,
  openExportDialog,
  renderComparison,
  renderExport,
  runExport,
  selectAllDiffering,
  setComparison,
} from './exportdialog';
import { activityDialog, closeActivityDialog, confirmActivityImport, onActivityFile, renderActivityDialog, workPhaseOf } from './activitydialog';
import { CARD_ROLES, detailModel, openDetails, renderDetailsPanel } from './detailspanel';
export { ROW_DRAG_TYPE } from './appstate';
export { captureWorkState, saveWork, openWorkFile } from './workfile';
export { captureExport } from './exportdialog';
export type { ExportChoice } from './exportdialog';
export { documentTable, documentScene } from './documentdialog';

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

export let mapView: MapView | null = null;

type MapError =
  | 'unsupported'
  | 'unreadable'
  | 'needs-background'
  | 'pdf-unreadable'
  | 'pdf-render'
  | 'pdf-too-large'
  | 'osm-malformed'
  | 'osm-empty'
  | 'osm-too-large'
  | 'osm-render';

export function showMapError(kind: MapError | null): void {
  const t = strings(state.prefs.lang);
  const messages: Record<MapError, string> = {
    unsupported: t.mapUnsupported,
    unreadable: t.mapUnreadable,
    'needs-background': t.markerNeedsBackground,
    'pdf-unreadable': t.pdfUnreadable,
    'pdf-render': t.pdfRenderFailed,
    'pdf-too-large': t.pdfTooLarge,
    'osm-malformed': t.osmMalformed,
    'osm-empty': t.osmEmpty,
    'osm-too-large': t.osmTooLarge,
    'osm-render': t.osmRenderFailed,
  };
  const errorEl = el('map-error');
  errorEl.classList.toggle('hidden', kind === null);
  errorEl.textContent = kind ? messages[kind] : '';
}

let markerLayer: MarkerLayer | null = null;

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
function symbolSource(row: RowData): 'manual' | 'status' | 'default' {
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

// What the visible items carry (FR-75): the used-only filter of the
// Presentation segment's legend and of the exported viewer's. An item without
// a marker counts too: the timeline includes it, wearing its colour and
// symbol (FR-67).
export function presentationLegendUse(): LegendUse {
  const shown = state.rows.filter((r) => !state.excluded.has(r));
  const statusKey = state.roles.status;
  const groups = new Set<number>();
  if (groupedNumbering()) {
    for (const { row, label } of numbered()) {
      if (state.excluded.has(row)) {
        continue;
      }
      const match = /^(\d+)\.\d+$/.exec(label);
      if (match) {
        groups.add(Number(match[1]));
      }
    }
  }
  return {
    colours: new Set(shown.map((r) => r.colour)),
    symbols: new Set(shown.map((r) => symbolOf(r))),
    statuses: new Set(statusKey === undefined ? [] : shown.map((r) => normalise(r.values[statusKey] ?? ''))),
    groups,
  };
}

// The costs view's series key (FR-79 as amended): the legend
// carries the series entries with their styles when the costs view is shown,
// under the used-only rule (FR-75) -- only the series actually present among
// the visible items, each with its meaning (the series' name, the user's own
// words per FR-63). Undefined in the other views.
function costsSeriesLegend(): SeriesLegend | undefined {
  if (state.presentationMode !== 'costs') {
    return undefined;
  }
  const t = strings(state.prefs.lang);
  const series = effectiveSeries();
  const roleNames: Record<SeriesRole, string> = { budget: t.seriesRoleBudget, forecast: t.seriesRoleForecast, outcome: t.seriesRoleOutcome };
  const names = Object.fromEntries(SERIES_ROLES.map((role) => [role, series[role]?.name ?? roleNames[role]])) as Record<SeriesRole, string>;
  const shown = state.rows.filter((r) => !state.excluded.has(r));
  const used = new Set<SeriesRole>();
  for (const role of SERIES_ROLES) {
    for (const key of Object.values(series[role]?.columns ?? {})) {
      // A series is present when at least one visible item has a readable
      // amount in it, so at least one of its bars is drawn.
      if (shown.some((r) => readAmount(r.values[key] ?? '', state.currencyUnit).kind === 'number')) {
        used.add(role);
        break;
      }
    }
  }
  return { names, used };
}

// The legend's work-phase entry (FR-75 as amended): only in the
// timeline view, and only when at least one visible item has a work phase
// that is drawn -- its activity's dates read.
function workPhaseShown(): boolean {
  if (state.presentationMode !== 'timeline') {
    return false;
  }
  return state.rows.some((row) => {
    if (state.excluded.has(row)) {
      return false;
    }
    const id = workPhaseOf(row);
    const activity = id === undefined ? undefined : state.activities.get(row)!.find((a) => a.id === id);
    return activity !== undefined && readDate(activity.start).kind === 'date' && readDate(activity.end).kind === 'date';
  });
}

// The legend's today entry (FR-75 as noted): today's date while a
// schedule view is shown, its mark drawn or counted at an edge.
function scheduleToday(): string | undefined {
  if (state.presentationMode === 'map') {
    return undefined;
  }
  const day = todayDay();
  return formatDate({ kind: 'date', start: day, end: day, precision: 'day' });
}

function renderLegends(): void {
  const t = strings(state.prefs.lang);
  const groups = shownProgramGroups();
  const labels = colourLabels();
  const names = symbolLabels();
  // The Map segment's legend keeps the working palette (FR-6 as amended);
  // the presentation's is used-only (FR-75), with the costs view's series
  // key when the costs view is shown (FR-79 as amended).
  renderLegend(el('map-legend'), t, state.statuses, groups, labels, names);
  renderLegend(
    el('presentation-legend'),
    t,
    state.statuses,
    groups,
    labels,
    names,
    presentationLegendUse(),
    costsSeriesLegend(),
    workPhaseShown(),
    scheduleToday(),
  );
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

// The display name of an item (FR-1): name/title, else identifier, else the
// item's number.
export function itemLabel(row: RowData, number: string): string {
  return displayName(row.values, state.roles, `${strings(state.prefs.lang).numberColumn} ${number}`);
}

function markerLabel(marker: PlacedMarker): string {
  return `${strings(state.prefs.lang).markerLabel} ${marker.label}: ${itemLabel(marker.row, marker.label)}`;
}

function selectMarker(id: string | null): void {
  state.selectedMarker = id;
  renderMapItems();
  // Selecting a marker opens its details; the panel follows the selection.
  if (id !== null) {
    openDetails(id);
  }
}

function moveMarker(id: string, position: Point): void {
  const row = rowById(id);
  if (!row) {
    return;
  }
  placeMarker(state.positions, row, position);
  markDirty();
  renderMapItems();
}

function deleteMarker(id: string): void {
  const row = rowById(id);
  if (row && removeMarker(state.positions, row)) {
    markDirty();
  }
  if (state.selectedMarker === id) {
    state.selectedMarker = null;
  }
  renderMapItems();
}

// Tap-to-place (FR-73): the item waiting for a tap on the stage, if any.
let placingId: string | null = null;
let placingDown: { id: number; x: number; y: number } | null = null;
// The distance a tap may move and still be a tap, in pixels.
const TAP_SLOP = 8;

function startPlacing(id: string): void {
  placingId = id;
  closeNarrowOverlay();
  renderPlacing();
}

function stopPlacing(): void {
  if (placingId === null) {
    return;
  }
  placingId = null;
  placingDown = null;
  renderPlacing();
}

function renderPlacing(): void {
  const banner = el('place-banner');
  const row = placingId ? rowById(placingId) : undefined;
  if (!row || state.positions.has(row)) {
    placingId = null;
    banner.classList.add('hidden');
    delete el('map-stage').dataset.placing;
    return;
  }
  const t = strings(state.prefs.lang);
  el('place-banner-text').textContent = fill(t.placingHint, { name: itemLabel(row, numberLabel(row)) });
  banner.classList.remove('hidden');
  el('map-stage').dataset.placing = 'true';
}

function dropRowOnMap(id: string, clientX: number, clientY: number): void {
  const row = rowById(id);
  if (!row || !mapView) {
    return;
  }
  if (!mapView.background) {
    showMapError('needs-background');
    return;
  }
  showMapError(null);
  const position = screenToImage(mapView.viewport, mapView.stagePoint(clientX, clientY));
  placeMarker(state.positions, row, position);
  state.selectedMarker = id;
  markDirty();
  renderMapItems();
}

function renderPlacementList(): void {
  const t = strings(state.prefs.lang);
  const list = el('placement-list');
  list.innerHTML = '';
  numbered().forEach(({ row, label: number }) => {
    const id = rowId(row);
    const placed = state.positions.has(row);
    const li = document.createElement('li');
    li.className = 'placement-item';
    li.draggable = true;
    li.dataset.rowId = id;
    li.dataset.placed = placed ? 'true' : 'false';
    if (state.selectedMarker === id) {
      li.dataset.selected = 'true';
    }
    const badge = document.createElement('span');
    const symbol = symbolOf(row);
    badge.className = `marker-badge marker-${row.colour} ${symbolClasses(symbol)}`;
    drawSymbol(badge, symbol, String(number));
    const label = document.createElement('span');
    label.className = 'placement-label';
    label.textContent = itemLabel(row, number);
    const status = document.createElement('span');
    status.className = 'placement-status';
    status.textContent = placed ? t.placementPlaced : t.placementNotPlaced;
    li.append(badge, label, status);
    // Tap-to-place (FR-73): in the narrow layout, an unplaced item offers
    // the action; the stylesheet shows it there only.
    if (!placed) {
      const place = document.createElement('button');
      place.type = 'button';
      place.className = 'placement-place';
      place.textContent = t.placeOnMap;
      place.setAttribute('aria-label', fill(t.placeOnMapFor, { name: itemLabel(row, number) }));
      place.addEventListener('click', (e) => {
        e.stopPropagation();
        startPlacing(id);
      });
      li.appendChild(place);
    }
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData(ROW_DRAG_TYPE, id);
      e.dataTransfer?.setData('text/plain', itemLabel(row, number));
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'copyMove';
      }
    });
    li.addEventListener('click', () => {
      // In the narrow layout, choosing an entry closes the overlay and opens
      // the details (FR-72, FR-74).
      if (narrowApplication()) {
        closeNarrowOverlay();
      }
      if (state.positions.has(row)) {
        selectMarker(id);
      } else {
        openDetails(id);
      }
    });
    list.appendChild(li);
  });
  el('placement-hint').textContent = narrowApplication() ? t.placementHintNarrow : t.placementHint;
  el('placement-empty').classList.toggle('hidden', state.rows.length > 0);
  el('placement-hint').classList.toggle('hidden', state.rows.length === 0);
}

// Re-renders everything on the map that derives from the list: markers follow
// row deletions, colours, and the regenerated global numbering (FR-3).
export function renderMapItems(): void {
  pruneMarkers(state.positions, state.rows);
  if (state.selectedMarker) {
    const row = rowById(state.selectedMarker);
    if (!row || !state.positions.has(row)) {
      state.selectedMarker = null;
    }
  }
  for (const row of [...state.excluded]) {
    if (!state.rows.includes(row)) {
      state.excluded.delete(row);
    }
  }
  for (const row of [...state.shapes.keys()]) {
    if (!state.rows.includes(row)) {
      state.shapes.delete(row);
    }
  }
  // A footprint whose item is no longer in the data (a new import) becomes a
  // free annotation.
  for (const [id, row] of [...state.annotationLinks]) {
    if (!state.ingested.includes(row)) {
      state.annotationLinks.delete(id);
    }
  }
  const markers = placedMarkers(state.rows, state.positions, effectiveSymbols(), numbered());
  markerLayer?.render(markers, state.selectedMarker);
  renderAnnotations();
  renderGlance('map', mapView, state.selectedMarker, (id) => {
    // In the narrow layout, choosing an entry closes the overlay (FR-72).
    if (narrowApplication()) {
      closeNarrowOverlay();
    }
    selectMarker(id);
  });
  renderPresentation();
  applyHighlight();
  renderPlacementList();
  renderPlacing();
  const t = strings(state.prefs.lang);
  const selected = markers.find((m) => rowId(m.row) === state.selectedMarker);
  el('marker-selection').textContent = selected ? `${t.markerSelected}: ${selected.label}` : t.markerNoSelection;
  // The details panel names the item's footprints (FR-48).
  if (state.detailsId) {
    renderDetailsPanel();
  }
  el<HTMLButtonElement>('marker-remove').disabled = !selected;
  const shapeSelect = el<HTMLSelectElement>('marker-shape');
  shapeSelect.disabled = !selected;
  if (shapeSelect.options.length !== SYMBOLS.length) {
    shapeSelect.innerHTML = '';
    for (const shape of SYMBOLS) {
      const opt = document.createElement('option');
      opt.value = shape;
      shapeSelect.appendChild(opt);
    }
  }
  for (const opt of shapeSelect.options) {
    opt.textContent = symbolLabel(opt.value as MarkerSymbol);
  }
  shapeSelect.value = selected?.shape ?? 'circle';
  // The presentation's legend follows the visibility (FR-75): recomputed on
  // every change of the items, including every visibility toggle (FR-27).
  renderLegends();
}

// The annotation layer (FR-47): drawn and edited on the Map stage, shown
// view-only on the Presentation stage.
let mapAnnotations: AnnotationLayer | null = null;
let presentationAnnotations: AnnotationLayer | null = null;
let drawingTools: DrawingTools | null = null;
let annotationDraft: { draft: Annotation | null; cursor: Point | null } = { draft: null, cursor: null };

// Linkage (FR-48): a linked annotation is its item's footprint and follows
// the item's visibility (removed from the list or switched off for the
// presentation, it goes too); a free annotation has its own toggle.
export function linkedRow(a: Annotation): RowData | undefined {
  return state.annotationLinks.get(a.id);
}

export function annotationShown(a: Annotation): boolean {
  const row = linkedRow(a);
  if (row) {
    return state.rows.includes(row) && !state.excluded.has(row);
  }
  return !state.hiddenAnnotations.has(a.id);
}

// The footprints of the item selected in a stage highlight with it.
function footprintsOf(id: string | null): Set<string> {
  const row = id ? rowById(id) : undefined;
  return new Set(row ? state.annotations.filter((a) => linkedRow(a) === row).map((a) => a.id) : []);
}

function renderAnnotations(): void {
  const mapBg = mapView?.background ?? null;
  const selected = state.annotations.find((a) => a.id === state.selectedAnnotation) ?? null;
  // In the Map segment every annotation stays editable; those absent from
  // the presentation are shown faded, as switched-off markers are.
  mapAnnotations?.render(state.annotations, mapBg, {
    draft: annotationDraft.draft,
    cursor: annotationDraft.cursor,
    selectedId: state.selectedAnnotation,
    highlighted: footprintsOf(state.selectedMarker ?? state.detailsId),
    faded: new Set(state.annotations.filter((a) => !annotationShown(a)).map((a) => a.id)),
    handlesFor: drawingTools?.tool === 'select' ? selected : null,
  });
  renderPresentationAnnotations();
}

// The presentation stage's annotations, also on its own background and view
// changes (in the exported viewer the background arrives after the first
// rendering).
function renderPresentationAnnotations(): void {
  presentationAnnotations?.render(
    state.annotations.filter((a) => annotationShown(a)),
    presentationView?.background ?? null,
    { highlighted: footprintsOf(state.presentationSelected) },
  );
}

function createAnnotation(annotation: Annotation): void {
  state.annotations = [...state.annotations, annotation];
  state.selectedAnnotation = annotation.id;
  setDrawingTool('select');
  markDirty();
  renderMapItems();
  renderAnnotationInspector();
}

function replaceAnnotation(annotation: Annotation): void {
  state.annotations = state.annotations.map((a) => (a.id === annotation.id ? annotation : a));
}

function selectAnnotation(id: string | null): void {
  state.selectedAnnotation = id;
  renderAnnotations();
  renderAnnotationInspector();
  renderAnnotationToolbar();
}

function deleteAnnotation(id: string): void {
  state.annotations = state.annotations.filter((a) => a.id !== id);
  state.annotationLinks.delete(id);
  state.hiddenAnnotations.delete(id);
  if (state.selectedAnnotation === id) {
    state.selectedAnnotation = null;
  }
  markDirty();
  renderMapItems();
  renderAnnotationInspector();
}

function updateSelectedAnnotation(change: Partial<Annotation>): void {
  const a = state.annotations.find((x) => x.id === state.selectedAnnotation);
  if (!a) {
    return;
  }
  replaceAnnotation({ ...a, ...change });
  markDirty();
  renderMapItems();
  renderAnnotationInspector();
}

function setAnnotationLink(id: string, row: RowData | null): void {
  if (row) {
    state.annotationLinks.set(id, row);
    state.hiddenAnnotations.delete(id);
  } else {
    state.annotationLinks.delete(id);
  }
  markDirty();
  renderMapItems();
  renderAnnotationInspector();
}

function setAnnotationHidden(id: string, hidden: boolean): void {
  if (hidden) {
    state.hiddenAnnotations.add(id);
  } else {
    state.hiddenAnnotations.delete(id);
  }
  markDirty();
  renderMapItems();
}

export function areaLocale(): string {
  return state.prefs.lang === 'sv' ? 'sv-SE' : 'en-GB';
}

function kindName(kind: AnnotationKind, t: Strings): string {
  return { rectangle: t.kindRectangle, circle: t.kindCircle, polygon: t.kindPolygon, line: t.kindLine }[kind];
}

// The name of an annotation in lists: its label, else its kind and position.
export function annotationName(a: Annotation, t: Strings): string {
  if (a.label.trim() !== '') {
    return a.label.trim();
  }
  const sameKind = state.annotations.filter((x) => x.kind === a.kind);
  return `${kindName(a.kind, t)} ${sameKind.indexOf(a) + 1}`;
}

// The inspector as a bottom sheet over the stage in the narrow layout
// (FR-47 as amended, FR-72): a data-state of open or closed, inert
// while closed, focus moved into the sheet on opening and returned on
// closing; the stage never moves under a selection, because the sheet
// overlays it (the details-sheet pattern of FR-74). Above the threshold the
// inspector keeps its place in the flow, hidden while nothing is selected.
let annotationInspectorReturnFocus: HTMLElement | null = null;

function setAnnotationInspectorSheet(open: boolean): void {
  const inspector = el('annotation-inspector');
  const was = inspector.dataset.state === 'open';
  inspector.classList.remove('hidden');
  inspector.dataset.state = open ? 'open' : 'closed';
  inspector.inert = !open;
  if (open) {
    inspector.removeAttribute('inert');
  } else {
    inspector.setAttribute('inert', '');
  }
  inspector.tabIndex = -1;
  if (open && !was) {
    annotationInspectorReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inspector.focus({ preventScroll: true });
  } else if (!open && was) {
    const target = annotationInspectorReturnFocus;
    annotationInspectorReturnFocus = null;
    if (target?.isConnected) {
      target.focus({ preventScroll: true });
    }
  }
}

// The inspector of the selected annotation (FR-47 to FR-49): its label, the
// item it is the footprint of, its area where it can be measured honestly,
// and its deletion.
function renderAnnotationInspector(): void {
  const t = strings(state.prefs.lang);
  const inspector = el('annotation-inspector');
  const a = state.annotations.find((x) => x.id === state.selectedAnnotation) ?? null;
  if (narrowApplication()) {
    setAnnotationInspectorSheet(a !== null);
  } else {
    // Above the threshold (or leaving the narrow layout): the inspector
    // keeps its place in the flow, and nothing of the sheet remains.
    inspector.classList.toggle('hidden', !a);
    delete inspector.dataset.state;
    inspector.inert = false;
    inspector.removeAttribute('inert');
    inspector.removeAttribute('tabindex');
    annotationInspectorReturnFocus = null;
  }
  if (!a) {
    return;
  }
  inspector.dataset.annotationId = a.id;
  el('annotation-inspector-heading').textContent = annotationName(a, t);
  el('annotation-label-text').textContent = t.annotationLabel;
  const label = el<HTMLInputElement>('annotation-label');
  if (document.activeElement !== label) {
    label.value = a.label;
  }
  el('annotation-link-text').textContent = t.annotationLink;
  const link = el<HTMLSelectElement>('annotation-link');
  link.innerHTML = '';
  const none = document.createElement('option');
  none.value = '';
  none.textContent = t.annotationNotLinked;
  link.appendChild(none);
  for (const { row, label: number } of numbered()) {
    const opt = document.createElement('option');
    opt.value = rowId(row);
    opt.textContent = `${number}. ${itemLabel(row, number)}`;
    link.appendChild(opt);
  }
  const row = linkedRow(a);
  link.value = row && state.rows.includes(row) ? rowId(row) : '';
  el('annotation-delete').textContent = t.annotationDelete;
  el('annotation-inspector-close').textContent = t.close;
  const area = el('annotation-area');
  if (a.kind === 'line') {
    area.textContent = '';
  } else {
    const squareMetres = trueArea(a, mapView?.background?.projection);
    area.textContent = squareMetres === null ? t.annotationAreaNoScale : fill(t.annotationArea, { area: formatArea(squareMetres, areaLocale()) });
  }
}

// The free annotations' toggles beside the presentation stage (FR-48).
function renderAnnotationVisibility(): void {
  const t = strings(state.prefs.lang);
  const list = el('annotation-visibility-list');
  list.innerHTML = '';
  const free = state.viewOnly ? [] : state.annotations.filter((a) => !linkedRow(a));
  for (const a of free) {
    const li = document.createElement('li');
    li.className = 'visibility-item';
    li.dataset.annotationId = a.id;
    const label = document.createElement('label');
    label.className = 'visibility-control';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'annotation-toggle';
    toggle.dataset.annotationId = a.id;
    toggle.checked = !state.hiddenAnnotations.has(a.id);
    const name = annotationName(a, t);
    toggle.setAttribute('aria-label', `${t.annotationShown}: ${name}`);
    toggle.addEventListener('change', () => setAnnotationHidden(a.id, !toggle.checked));
    const swatch = document.createElement('span');
    swatch.className = `legend-swatch marker-${a.colour} marker-shape-square`;
    swatch.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'placement-label';
    text.textContent = name;
    label.append(toggle, swatch, text);
    li.appendChild(label);
    list.appendChild(li);
  }
  el('annotation-visibility-heading').textContent = t.annotationVisibility;
  el('annotation-visibility-heading').classList.toggle('hidden', free.length === 0);
}

function setDrawingTool(tool: DrawingTool): void {
  drawingTools?.setTool(tool);
  annotationDraft = { draft: null, cursor: null };
  renderAnnotationToolbar();
  renderAnnotations();
}

// The style controls set the style of what is drawn next and, while an
// annotation is selected, its style too.
function setAnnotationStyle(change: Partial<AnnotationStyle>): void {
  state.annotationStyle = { ...state.annotationStyle, ...change };
  if (state.selectedAnnotation) {
    updateSelectedAnnotation(change);
  }
  renderAnnotationToolbar();
}

function renderAnnotationToolbar(): void {
  const t = strings(state.prefs.lang);
  const has = mapView?.background !== null && mapView?.background !== undefined;
  const tool = drawingTools?.tool ?? 'select';
  el('annotation-heading').textContent = t.annotationHeading;
  const toolNames: Record<DrawingTool, string> = {
    select: t.toolSelect,
    rectangle: t.toolRectangle,
    circle: t.toolCircle,
    polygon: t.toolPolygon,
    line: t.toolLine,
  };
  document.querySelectorAll<HTMLButtonElement>('#annotation-tools .annotation-tool').forEach((button) => {
    const name = button.dataset.tool as DrawingTool;
    button.textContent = toolNames[name];
    button.setAttribute('aria-pressed', name === tool ? 'true' : 'false');
    button.disabled = !has && name !== 'select';
  });
  el('annotation-colour-text').textContent = t.annotationColour;
  el('annotation-fill-text').textContent = t.annotationFill;
  el('annotation-outline-text').textContent = t.annotationOutline;
  el('annotation-line-text').textContent = t.annotationLine;
  const colour = el<HTMLSelectElement>('annotation-colour');
  if (colour.options.length !== COLOURS.length) {
    colour.innerHTML = '';
    for (const c of COLOURS) {
      const opt = document.createElement('option');
      opt.value = c;
      colour.appendChild(opt);
    }
  }
  for (const opt of colour.options) {
    opt.textContent = colourLabel(opt.value as RowColour);
  }
  // While an annotation is selected, the controls show its style.
  const style = state.annotations.find((a) => a.id === state.selectedAnnotation) ?? state.annotationStyle;
  colour.value = style.colour;
  const fillInput = el<HTMLInputElement>('annotation-fill');
  fillInput.value = String(Math.round(style.fillOpacity * 100));
  fillInput.setAttribute('aria-valuetext', `${fillInput.value} %`);
  el('annotation-fill-value').textContent = `${fillInput.value} %`;
  const outline = el<HTMLSelectElement>('annotation-outline');
  const outlineNames: Record<Outline, string> = { black: t.outlineBlack, white: t.outlineWhite };
  for (const opt of outline.options) {
    opt.textContent = outlineNames[opt.value as Outline];
  }
  outline.value = style.outline;
  const line = el<HTMLSelectElement>('annotation-line-style');
  const lineNames: Record<LineStyle, string> = { solid: t.lineSolid, dotted: t.lineDotted, dashed: t.lineDashed };
  for (const opt of line.options) {
    opt.textContent = lineNames[opt.value as LineStyle];
  }
  line.value = style.lineStyle;
  const hints: Record<DrawingTool, string> = {
    select: t.hintSelect,
    rectangle: t.hintRectangle,
    circle: t.hintCircle,
    polygon: t.hintPolygon,
    line: t.hintLine,
  };
  el('annotation-hint').textContent = has ? hints[tool] : t.hintNoBackground;
  // While a drawing is in progress, the hint row carries Done and Cancel
  // (FR-47 as amended); the Straight toggle beside the tools
  // carries its state.
  const drawing = drawingTools?.drawing ?? false;
  el('annotation-done').textContent = t.hintDone;
  el('annotation-cancel').textContent = t.hintCancel;
  el('annotation-done').classList.toggle('hidden', !drawing);
  el('annotation-cancel').classList.toggle('hidden', !drawing);
  const straight = el<HTMLButtonElement>('annotation-straight');
  straight.textContent = t.toolStraight;
  straight.setAttribute('aria-label', t.toolStraight);
  straight.setAttribute('aria-pressed', drawingTools?.straight ? 'true' : 'false');
  straight.disabled = !has;
}

function wireAnnotationToolbar(): void {
  document.querySelectorAll<HTMLButtonElement>('#annotation-tools .annotation-tool').forEach((button) => {
    button.addEventListener('click', () => setDrawingTool(button.dataset.tool as DrawingTool));
  });
  // The Straight toggle (FR-47 as amended): one transient state
  // flag on the drawing tools, reset on tool change, never saved.
  el<HTMLButtonElement>('annotation-straight').addEventListener('click', () => {
    if (drawingTools) {
      drawingTools.straight = !drawingTools.straight;
    }
    renderAnnotationToolbar();
  });
  // Done and Cancel in the hint row finish or abandon a drawing.
  el('annotation-done').addEventListener('click', () => drawingTools?.finish());
  el('annotation-cancel').addEventListener('click', () => drawingTools?.cancel());
  el<HTMLSelectElement>('annotation-colour').addEventListener('change', (e) =>
    setAnnotationStyle({ colour: (e.target as HTMLSelectElement).value as RowColour }),
  );
  el<HTMLInputElement>('annotation-fill').addEventListener('input', (e) =>
    setAnnotationStyle({ fillOpacity: Number((e.target as HTMLInputElement).value) / 100 }),
  );
  el<HTMLSelectElement>('annotation-outline').addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value as Outline;
    if (OUTLINES.includes(value)) {
      setAnnotationStyle({ outline: value });
    }
  });
  el<HTMLSelectElement>('annotation-line-style').addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value as LineStyle;
    if (LINE_STYLES.includes(value)) {
      setAnnotationStyle({ lineStyle: value });
    }
  });
  // Enter finishes a polygon or a line being drawn; Escape cancels it.
  // With an annotation selected (and no text field in use), Delete removes
  // it and Escape deselects it.
  window.addEventListener('keydown', (e) => {
    if (state.segment !== 'map' || !drawingTools) {
      return;
    }
    if (drawingTools.drawing) {
      if (e.key === 'Escape') {
        drawingTools.cancel();
      } else if (e.key === 'Enter') {
        drawingTools.finish();
      }
      return;
    }
    const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]');
    if (!state.selectedAnnotation || typing) {
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteAnnotation(state.selectedAnnotation);
    } else if (e.key === 'Escape') {
      selectAnnotation(null);
    }
  });
  const label = el<HTMLInputElement>('annotation-label');
  label.addEventListener('input', () => updateSelectedAnnotation({ label: label.value }));
  el<HTMLSelectElement>('annotation-link').addEventListener('change', (e) => {
    const id = state.selectedAnnotation;
    if (!id) {
      return;
    }
    const value = (e.target as HTMLSelectElement).value;
    setAnnotationLink(id, value === '' ? null : (rowById(value) ?? null));
  });
  el('annotation-delete').addEventListener('click', () => {
    if (state.selectedAnnotation) {
      deleteAnnotation(state.selectedAnnotation);
    }
  });
  el('annotation-inspector-close').addEventListener('click', () => selectAnnotation(null));
  // In the narrow layout, a tap outside the stage and the open inspector
  // sheet closes the sheet (the stage's own taps select and deselect). On
  // the window, so that the test harness removes the listener between
  // mounts, like the other window listeners.
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (!narrowApplication()) {
        return;
      }
      const inspector = el('annotation-inspector');
      if (inspector.dataset.state !== 'open') {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (inspector.contains(target) || target.closest('#map-stage')) {
        return;
      }
      selectAnnotation(null);
    },
    true,
  );
}

// Presentation stage (FR-27): the same background on its own viewport, with
// the markers of the items that are switched on. Nothing is edited here.
export let presentationView: MapView | null = null;
let presentationLayer: MarkerLayer | null = null;

// In the exported viewer, the view the file carries (FR-38 as amended):
// restored when the viewer's stage first shows the background, with the
// exported stage's centre at the viewer stage's centre.
let viewerView: { viewport: Viewport; stage?: { width: number; height: number } } | null = null;

function syncPresentationBackground(): void {
  if (!presentationView || !mapView) {
    return;
  }
  const bg = mapView.background;
  if (!bg) {
    if (presentationView.background) {
      presentationView.clearBackground({ scale: 1, x: 0, y: 0 });
    }
  } else if (presentationView.background?.src !== bg.src) {
    const view = presentationView;
    const saved = viewerView;
    viewerView = null;
    // The saved view, centred on the stage as it is when applied.
    const centred = (): Viewport | undefined => {
      const now = view.stageSize();
      if (!saved || now.width <= 0 || now.height <= 0) {
        return undefined;
      }
      const v = saved.viewport;
      const then = saved.stage ?? now;
      return { scale: v.scale, x: v.x + (now.width - then.width) / 2, y: v.y + (now.height - then.height) / 2 };
    };
    void view.setBackgroundSource(bg.src, centred()).then((ok) => {
      // The viewer's layout settles once its list and legend are drawn: the
      // view is centred again on the settled stage.
      if (!ok || !saved) {
        return;
      }
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const v = centred();
          if (v) {
            view.restoreView(v);
          }
        }),
      );
    });
  }
}

function setExcluded(row: RowData, excluded: boolean): void {
  if (excluded) {
    state.excluded.add(row);
  } else {
    state.excluded.delete(row);
  }
  markDirty();
  renderMapItems();
}

// The list beside the presentation stage: a visibility toggle per placed
// item (FR-27). The exported viewer renders no item list (FR-38 as
// amended).
function renderVisibilityList(): void {
  const t = strings(state.prefs.lang);
  const list = el('visibility-list');
  list.innerHTML = '';
  if (state.viewOnly) {
    return;
  }
  const entries = placedMarkers(state.rows, state.positions, effectiveSymbols(), numbered());
  for (const entry of entries) {
    const id = rowId(entry.row);
    const shown = !state.excluded.has(entry.row);
    const li = document.createElement('li');
    li.className = 'visibility-item';
    li.dataset.rowId = id;
    li.dataset.shown = shown ? 'true' : 'false';
    if (state.presentationSelected === id) {
      li.dataset.selected = 'true';
    }
    const name = itemLabel(entry.row, entry.label);
    const badge = document.createElement('span');
    badge.className = `marker-badge marker-${entry.colour} ${symbolClasses(entry.shape)}`;
    drawSymbol(badge, entry.shape, entry.label);
    const text = document.createElement('span');
    text.className = 'placement-label';
    text.textContent = name;
    const label = document.createElement('label');
    label.className = 'visibility-control';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'visibility-toggle';
    toggle.dataset.rowId = id;
    toggle.checked = shown;
    toggle.setAttribute('aria-label', `${t.visibilityShown}: ${name}`);
    toggle.addEventListener('change', () => setExcluded(entry.row, !toggle.checked));
    label.append(toggle, badge, text);
    li.appendChild(label);
    list.appendChild(li);
  }
  el('visibility-heading').textContent = t.visibilityHeading;
  el('visibility-hint').textContent = t.visibilityHint;
  el('visibility-empty').classList.toggle('hidden', entries.length > 0);
  renderAnnotationVisibility();
  el('visibility-hint').classList.toggle('hidden', entries.length === 0);
}

// At-a-glance panels (FR-28): the switched-on items whose markers are inside
// the visible part of a stage, with cross-highlighting between entries and
// markers.
let hoverId: string | null = null;

function setHover(id: string | null): void {
  hoverId = id;
  applyHighlight();
}

function applyHighlight(): void {
  document.querySelectorAll<HTMLElement>('.marker[data-row-id], .glance-entry[data-row-id], .timeline-entry[data-row-id]').forEach((node) => {
    node.classList.toggle('highlighted', hoverId !== null && node.dataset.rowId === hoverId);
  });
  // A program group shows the highlight of any of its items (FR-44), so that
  // it is visible while the group is collapsed.
  document.querySelectorAll<HTMLElement>('.glance-group-toggle[data-row-ids]').forEach((node) => {
    node.classList.toggle('highlighted', hoverId !== null && node.dataset.rowIds!.split(' ').includes(hoverId));
  });
}

// An entry of an at-a-glance panel (FR-28): the marker's badge, the item's
// name, and the item's area.
function glanceEntry(marker: PlacedMarker, selectedId: string | null, onSelect: (id: string) => void): HTMLLIElement {
  const id = rowId(marker.row);
  const areaKey = state.roles.area;
  const li = document.createElement('li');
  const entry = document.createElement('button');
  entry.type = 'button';
  entry.className = 'glance-entry';
  entry.dataset.rowId = id;
  if (selectedId === id) {
    entry.dataset.selected = 'true';
  }
  const badge = document.createElement('span');
  badge.className = `marker-badge marker-${marker.colour} ${symbolClasses(marker.shape)}`;
  drawSymbol(badge, marker.shape, marker.label);
  const text = document.createElement('span');
  text.className = 'glance-text';
  const name = document.createElement('span');
  name.className = 'glance-name';
  name.textContent = itemLabel(marker.row, marker.label);
  text.appendChild(name);
  // The chosen columns' values (FR-46), empty ones left out.
  const values = document.createElement('span');
  values.className = 'glance-values';
  for (const key of shownGlanceColumns()) {
    const value = (marker.row.values[key] ?? '').trim();
    if (value === '') {
      continue;
    }
    const valueEl = document.createElement('span');
    valueEl.className = key === areaKey ? 'glance-value glance-area' : 'glance-value';
    valueEl.dataset.header = key;
    valueEl.title = labelOf(key);
    valueEl.textContent = value;
    values.appendChild(valueEl);
  }
  if (values.childElementCount > 0) {
    text.appendChild(values);
    // A narrow panel shortens the values; the full text is in the tooltip.
    entry.title = [...values.children].map((v) => `${(v as HTMLElement).title}: ${v.textContent}`).join('\n');
  }
  entry.append(badge, text);
  entry.addEventListener('mouseenter', () => setHover(id));
  entry.addEventListener('mouseleave', () => setHover(null));
  entry.addEventListener('focus', () => setHover(id));
  entry.addEventListener('blur', () => setHover(null));
  entry.addEventListener('click', () => onSelect(id));
  li.appendChild(entry);
  return li;
}

// Configurable at-a-glance columns (FR-46): the user's choice, or by default
// the columns of the area, start, and end roles; columns that no longer exist
// drop out. The name column is shown as the entry's name already.
function defaultGlanceColumns(): string[] {
  return (['area', 'start', 'end'] as const).map((r) => state.roles[r]).filter((k): k is string => k !== undefined);
}

function shownGlanceColumns(): string[] {
  const chosen = state.glanceColumns ?? defaultGlanceColumns();
  return chosen.filter((key) => state.headers.includes(key) && key !== state.roles.name);
}

function setGlanceColumn(key: string, shown: boolean): void {
  const current = shownGlanceColumns();
  const next = shown ? [...current, key] : current.filter((k) => k !== key);
  // The chosen columns keep the list's column order.
  const order = listColumnOrder(state.headers, state.roles);
  state.glanceColumns = order.filter((k) => next.includes(k));
  markDirty();
  renderList();
}

// Card fields (FR-62): the user's choice of columns for the card, or by
// default the columns of the card's roles. The name column is the card's
// header already.
function defaultCardColumns(): string[] {
  return CARD_ROLES.map((r) => state.roles[r]).filter((k): k is string => k !== undefined);
}

export function shownCardColumns(): string[] {
  const chosen = state.cardColumns ?? defaultCardColumns();
  return chosen.filter((key) => state.headers.includes(key) && key !== state.roles.name);
}

function setCardColumn(key: string, shown: boolean): void {
  const current = shownCardColumns();
  const next = shown ? [...current, key] : current.filter((k) => k !== key);
  // The chosen columns keep the list's column order.
  const order = listColumnOrder(state.headers, state.roles);
  state.cardColumns = order.filter((k) => next.includes(k));
  markDirty();
  renderList();
}

function renderCardFieldPicker(): void {
  const t = strings(state.prefs.lang);
  el('card-fields-summary').textContent = t.cardFieldsSummary;
  el('card-fields-hint').textContent = t.cardFieldsHint;
  el('card-fields-reset').textContent = t.cardFieldsReset;
  el<HTMLButtonElement>('card-fields-reset').disabled = state.cardColumns === null;
  const list = el('card-fields-list');
  list.innerHTML = '';
  const shown = shownCardColumns();
  const candidates = listColumnOrder(state.headers, state.roles).filter((k) => k !== state.roles.name);
  for (const key of candidates) {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'card-field-toggle';
    box.dataset.header = key;
    box.checked = shown.includes(key);
    box.addEventListener('change', () => setCardColumn(key, box.checked));
    const text = document.createElement('span');
    text.textContent = labelOf(key);
    label.append(box, text);
    li.appendChild(label);
    list.appendChild(li);
  }
  if (candidates.length === 0) {
    const none = document.createElement('li');
    none.className = 'notice';
    none.textContent = t.glanceColumnsNone;
    list.appendChild(none);
  }
}

function renderGlanceColumnPicker(): void {
  const t = strings(state.prefs.lang);
  el('glance-columns-summary').textContent = t.glanceColumns;
  el('glance-columns-reset').textContent = t.glanceColumnsReset;
  el<HTMLButtonElement>('glance-columns-reset').disabled = state.glanceColumns === null;
  const list = el('glance-columns-list');
  list.innerHTML = '';
  const shown = shownGlanceColumns();
  const candidates = listColumnOrder(state.headers, state.roles).filter((k) => k !== state.roles.name);
  for (const key of candidates) {
    const li = document.createElement('li');
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'glance-column-toggle';
    box.dataset.header = key;
    box.checked = shown.includes(key);
    box.addEventListener('change', () => setGlanceColumn(key, box.checked));
    const text = document.createElement('span');
    text.textContent = labelOf(key);
    label.append(box, text);
    li.appendChild(label);
    list.appendChild(li);
  }
  if (candidates.length === 0) {
    const none = document.createElement('li');
    none.className = 'notice';
    none.textContent = t.glanceColumnsNone;
    list.appendChild(none);
  }
}

// Program groups at a glance (FR-44): with the program role assigned, the
// entries of a program nest under one collapsible group, placed where its
// first entry would be; collapsed, the group shows alone. Entries without a
// program stay plain. Each panel keeps its own collapsed groups.
const collapsedPrograms: Record<'map' | 'presentation', Set<string>> = { map: new Set(), presentation: new Set() };

function programGroupItem(
  prefix: 'map' | 'presentation',
  program: string,
  members: PlacedMarker[],
  selectedId: string | null,
  onSelect: (id: string) => void,
): HTMLLIElement {
  const t = strings(state.prefs.lang);
  const collapsed = collapsedPrograms[prefix].has(program);
  const ids = members.map((m) => rowId(m.row));
  const li = document.createElement('li');
  li.className = 'glance-group';
  li.dataset.program = program;
  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'glance-group-toggle';
  header.dataset.rowIds = ids.join(' ');
  header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  header.setAttribute('aria-label', `${collapsed ? t.glanceGroupExpand : t.glanceGroupCollapse}: ${program}`);
  if (selectedId !== null && ids.includes(selectedId)) {
    header.dataset.selected = 'true';
  }
  const name = document.createElement('span');
  name.className = 'glance-group-name';
  name.textContent = program;
  const count = document.createElement('span');
  count.className = 'glance-group-count';
  count.textContent = String(members.length);
  header.append(name, count);
  header.addEventListener('click', () => {
    if (collapsedPrograms[prefix].has(program)) {
      collapsedPrograms[prefix].delete(program);
    } else {
      collapsedPrograms[prefix].add(program);
    }
    renderMapItems();
    document
      .querySelector<HTMLElement>(`#${prefix}-glance-list .glance-group[data-program="${program.replace(/["\\]/g, '\\$&')}"] .glance-group-toggle`)
      ?.focus();
  });
  li.appendChild(header);
  if (!collapsed) {
    const nested = document.createElement('ul');
    nested.className = 'glance-group-list';
    for (const marker of members) {
      nested.appendChild(glanceEntry(marker, selectedId, onSelect));
    }
    li.appendChild(nested);
  }
  return li;
}

function renderGlance(prefix: 'map' | 'presentation', view: MapView | null, selectedId: string | null, onSelect: (id: string) => void): void {
  const candidates = placedMarkers(state.rows, state.positions, effectiveSymbols(), numbered()).filter((m) => !state.excluded.has(m.row));
  const inView = view?.background ? markersInView(candidates, view.viewport, view.stageSize()) : [];
  // The presentation's "In view" list follows the presentation's order
  // (FR-70); the Map segment's keeps the numbers' order.
  renderGlanceEntries(prefix, prefix === 'presentation' ? inPresentationOrder(inView) : inView, selectedId, onSelect);
}

// The presentation's order (FR-70) applied to entries of the "In view"
// list; a program group then stands at its first member in that order.
function inPresentationOrder(entries: PlacedMarker[]): PlacedMarker[] {
  const { area, start } = state.roles;
  return orderEntries(
    entries,
    state.presentationOrder,
    (m) => ({ area: area === undefined ? '' : (m.row.values[area] ?? '').trim(), start: start === undefined ? null : startDay(m.row.values[start] ?? '') }),
    state.areaValues,
    areaLocale(),
  );
}

function renderGlanceEntries(prefix: 'map' | 'presentation', inView: PlacedMarker[], selectedId: string | null, onSelect: (id: string) => void): void {
  const t = strings(state.prefs.lang);
  const list = el(`${prefix}-glance-list`);
  list.innerHTML = '';
  const programKey = state.roles.program;
  const programOf = (m: PlacedMarker) => (programKey === undefined ? '' : (m.row.values[programKey] ?? '').trim());
  const placedGroups = new Set<string>();
  for (const marker of inView) {
    const program = programOf(marker);
    if (program === '') {
      list.appendChild(glanceEntry(marker, selectedId, onSelect));
    } else if (!placedGroups.has(program)) {
      placedGroups.add(program);
      list.appendChild(
        programGroupItem(
          prefix,
          program,
          inView.filter((m) => programOf(m) === program),
          selectedId,
          onSelect,
        ),
      );
    }
  }
  const heading = el(`${prefix}-glance-heading`);
  heading.textContent = t.glanceHeading;
  const count = document.createElement('span');
  count.className = 'glance-count';
  count.textContent = String(inView.length);
  heading.appendChild(count);
  el(`${prefix}-glance-empty`).textContent = t.glanceEmpty;
  el(`${prefix}-glance-empty`).classList.toggle('hidden', inView.length > 0);
}

// The economics view (FR-64): an overlay over the page, opened from the card
// or the details panel for an item with economics, with the card's pattern:
// a data-state, inert while closed, focus moved in and returned to what
// opened it, closed by its button or Escape.
let economicsRow: string | null = null;
let economicsOpener: HTMLElement | null = null;

export function itemSpan(row: RowData): { start: number | null; end: number | null } {
  const year = (key: string | undefined) => (key === undefined ? null : yearOfValue(row.values[key] ?? ''));
  return { start: year(state.roles.start), end: year(state.roles.end) };
}

export function economicsFor(row: RowData): Economics | null {
  return economicsOf(row.values, effectiveSeries(), itemSpan(row), state.currencyUnit);
}

export function openEconomics(id: string, opener: HTMLElement | null): void {
  economicsRow = id;
  economicsOpener = opener;
  renderEconomicsOverlay();
  el('economics-overlay').querySelector<HTMLElement>('.economics-close')?.focus({ preventScroll: true });
}

function closeEconomics(): void {
  const overlay = el('economics-overlay');
  const hadFocus = overlay.contains(document.activeElement);
  economicsRow = null;
  renderEconomicsOverlay();
  if (hadFocus && economicsOpener?.isConnected) {
    economicsOpener.focus({ preventScroll: true });
  }
  economicsOpener = null;
}

// The Information totals (FR-69): beside the row counters, over all retained
// rows (the filter does not change them, as it does not change the
// counters), shown only while a series is assigned.
function renderInformationTotals(): void {
  const line = el('list-totals');
  const series = effectiveSeries();
  const assigned = { budget: series.budget !== undefined, track: series.forecast !== undefined || series.outcome !== undefined };
  if (!assigned.budget && !assigned.track) {
    line.classList.add('hidden');
    line.replaceChildren();
    return;
  }
  const t = strings(state.prefs.lang);
  const totals = informationTotals(state.rows.map(economicsFor), assigned);
  const amount = (v: { sum: number; decimals: number }) => formatAmount(v.sum, v.decimals, { locale: areaLocale(), unit: state.currencyUnit });
  const part = (className: string, text: string, role?: string) => {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    if (role) {
      span.dataset.role = role;
    }
    return span;
  };
  const parts: HTMLElement[] = [part('list-totals-label', t.informationTotals)];
  if (totals.budget) {
    parts.push(part('list-total', `${series.budget!.name}: ${amount(totals.budget)}`, 'budget'));
  }
  if (totals.track) {
    const [outcome, forecast] = [series.outcome?.name ?? '', series.forecast?.name ?? ''];
    parts.push(part('list-total', `${outcome && forecast ? `${outcome} / ${forecast}` : outcome || forecast}: ${amount(totals.track)}`, 'track'));
  }
  if (totals.texts > 0) {
    parts.push(part('list-totals-note', format(t.informationTotalsTexts, { count: totals.texts })));
  }
  line.replaceChildren(...parts);
  line.classList.remove('hidden');
}

function renderEconomicsOverlay(): void {
  const overlay = el('economics-overlay');
  const row = economicsRow ? rowById(economicsRow) : undefined;
  const economics = row ? economicsFor(row) : null;
  if (!row || !economics) {
    economicsRow = null;
    overlay.dataset.state = 'closed';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    overlay.setAttribute('inert', '');
    return;
  }
  const t = strings(state.prefs.lang);
  const series = effectiveSeries();
  const outcome = series.outcome?.name ?? '';
  const forecast = series.forecast?.name ?? '';
  const track = outcome && forecast ? `${outcome} / ${forecast}` : outcome || forecast;
  renderEconomics(
    overlay,
    economics,
    {
      name: itemLabel(row, numberLabel(row)),
      heading: t.economicsHeading,
      close: t.close,
      year: t.economicsYear,
      budget: series.budget?.name ?? '',
      outcome,
      forecast,
      track,
      outside: t.economicsOutside,
      noValue: t.economicsNoValue,
      sumBeside: t.economicsSumBeside,
      composition: t.economicsComposition,
      compositionOnly: t.economicsCompositionOnly,
      texts: t.economicsTexts,
      span: t.economicsSpan,
    },
    { locale: areaLocale(), unit: state.currencyUnit },
    closeEconomics,
  );
  overlay.dataset.rowId = rowId(row);
  overlay.dataset.state = 'open';
  overlay.setAttribute('aria-hidden', 'false');
  overlay.inert = false;
  overlay.removeAttribute('inert');
}

// The presentation data card (FR-35): a view-only floating card with the
// same details as the details panel, opened by clicking a marker on the
// stage. Opening and closing it change nothing in the work.
let cardId: string | null = null;
let cardSignature = '';

function openCard(id: string | null): void {
  const previous = cardId;
  const hadFocus = el('presentation-card').contains(document.activeElement);
  cardId = id;
  state.presentationSelected = id;
  renderMapItems();
  if (id !== null) {
    el('presentation-card').querySelector<HTMLElement>('.details-close')?.focus({ preventScroll: true });
  } else if (previous !== null && hadFocus) {
    // Focus returns to the marker the card belonged to.
    const opener = timelineMode()
      ? `#presentation-${state.presentationMode} .timeline-chip[data-row-id="${previous}"]`
      : `#presentation-marker-layer .marker[data-row-id="${previous}"]`;
    document.querySelector<HTMLElement>(opener)?.focus({ preventScroll: true });
  }
}

function closeCard(): void {
  el('presentation-card').dataset.state = 'closed';
  openCard(null);
}

// The gap between a marker and the card beside it, in pixels.
const CARD_GAP = 28;

function renderCard(): void {
  const card = el('presentation-card');
  const row = cardId ? rowById(cardId) : undefined;
  // Where the card opens beside: on the map, the item's marker (in the
  // exported viewer, an item without a marker opens from the list, in the
  // stage's corner); on the timeline, the item's line (FR-67).
  let anchor: Point | null | undefined;
  if (timelineMode()) {
    anchor = row ? (schedule()?.anchorOf(rowId(row), el('presentation-stage')) ?? undefined) : undefined;
  } else {
    const placed = row && presentationView?.background ? state.positions.get(row) : undefined;
    const position = placed ?? (row && state.viewOnly ? null : undefined);
    anchor = position && presentationView ? imageToScreen(presentationView.viewport, position) : position;
  }
  if (!row || anchor === undefined || state.excluded.has(row) || !presentationView) {
    cardId = null;
    // The content stays during the exit transition; it is replaced on the
    // next opening.
    card.dataset.state = 'closed';
    card.setAttribute('aria-hidden', 'true');
    card.inert = true;
    card.setAttribute('inert', '');
    return;
  }
  const t = strings(state.prefs.lang);
  const model = detailModel(row, t);
  const hasEconomics = economicsFor(row) !== null;
  const signature = JSON.stringify([state.prefs.lang, model, hasEconomics]);
  if (signature !== cardSignature || card.dataset.rowId !== model.rowId || card.childElementCount === 0) {
    const refocus = card.contains(document.activeElement);
    cardSignature = signature;
    renderCardContent(
      card,
      model,
      { comments: t.detailsComments, close: t.close, fields: t.cardFields, footprints: t.detailsFootprints, noData: t.cardNoData },
      closeCard,
      hasEconomics ? { label: t.economicsAction, open: (opener) => openEconomics(rowId(row), opener) } : null,
    );
    if (refocus) {
      card.querySelector<HTMLElement>('.details-close')?.focus({ preventScroll: true });
    }
  }
  // In the narrow viewer, the card docks at the bottom of the stage, in the
  // stylesheet's place (FR-58).
  if (narrowViewer()) {
    card.dataset.dock = 'bottom';
    card.style.left = '';
    card.style.right = '';
    card.style.top = '';
    card.dataset.state = 'open';
    card.setAttribute('aria-hidden', 'false');
    card.inert = false;
    card.removeAttribute('inert');
    return;
  }
  delete card.dataset.dock;
  // Beside the marker, on the side with more room, and within the stage; an
  // item without a marker opens in the stage's corner.
  const size = presentationView.stageSize();
  const screen = anchor ?? { x: 16 - CARD_GAP, y: 0 };
  const side = screen.x <= size.width / 2 ? 'right' : 'left';
  card.dataset.side = side;
  if (side === 'right') {
    card.style.left = `${Math.round(screen.x + CARD_GAP)}px`;
    card.style.right = '';
  } else {
    card.style.right = `${Math.round(size.width - screen.x + CARD_GAP)}px`;
    card.style.left = '';
  }
  const height = card.offsetHeight;
  const margin = 16;
  const top = Math.max(margin, Math.min(screen.y - height / 2, size.height - height - margin));
  card.style.top = `${Math.round(top)}px`;
  card.dataset.state = 'open';
  card.setAttribute('aria-hidden', 'false');
  card.inert = false;
  card.removeAttribute('inert');
}

function renderPresentation(): void {
  const onTimeline = timelineMode();
  const shown = placedMarkers(state.rows, state.positions, effectiveSymbols(), numbered()).filter((m) => !state.excluded.has(m.row));
  const selectable = onTimeline ? state.rows.filter((r) => !state.excluded.has(r)) : shown.map((m) => m.row);
  if (state.presentationSelected && !selectable.some((r) => rowId(r) === state.presentationSelected)) {
    state.presentationSelected = null;
  }
  presentationLayer?.render(shown, state.presentationSelected);
  renderVisibilityList();
  // The view shown (FR-66): the switch, the stage's layers, and the toolbar.
  el('presentation-stage').dataset.view = state.presentationMode;
  el('presentation-toolbar').dataset.view = state.presentationMode;
  el<HTMLSelectElement>('pres-order').value = state.presentationOrder;
  el('presentation-timeline').classList.toggle('hidden', state.presentationMode !== 'timeline');
  el('presentation-costs').classList.toggle('hidden', state.presentationMode !== 'costs');
  for (const button of document.querySelectorAll<HTMLButtonElement>('.pres-mode-button')) {
    button.setAttribute('aria-pressed', button.dataset.mode === state.presentationMode ? 'true' : 'false');
  }
  if (state.presentationMode === 'timeline') {
    renderTimeline();
  }
  if (state.presentationMode === 'costs') {
    renderCosts();
  }
  renderPresentationGlance();
  renderCard();
  const has = onTimeline ? (schedule()?.hasLines() ?? false) : presentationView?.background !== null && presentationView?.background !== undefined;
  for (const id of ['pres-zoom-in', 'pres-zoom-out', 'pres-fit', 'pres-reset']) {
    el<HTMLButtonElement>(id).disabled = !has;
  }
  renderZoomLevel();
  // The timeline needs no background.
  el('presentation-empty').classList.toggle('hidden', has || onTimeline);
}

function renderZoomLevel(): void {
  const percent = timelineMode() ? (schedule()?.zoomPercent() ?? 100) : Math.round((presentationView?.viewport.scale ?? 1) * 100);
  el('pres-zoom-level').textContent = `${percent}%`;
}

// Choosing an entry of the "In view" list opens the item's card; in the
// narrow viewer, it first closes the overlay (FR-58).
function choosePresentationEntry(id: string): void {
  if (narrowViewer()) {
    closeNarrowOverlay();
  }
  if (timelineMode()) {
    schedule()?.reveal(id);
  }
  openCard(id);
}

// The "In view" list (FR-28): on the map, the markers in view; on the
// timeline, the visible lines (FR-67).
function renderPresentationGlance(): void {
  if (!timelineMode()) {
    renderGlance('presentation', presentationView, state.presentationSelected, choosePresentationEntry);
    return;
  }
  const lines = schedule()?.visibleLines() ?? [];
  const symbols = effectiveSymbols();
  const entries: PlacedMarker[] = lines.flatMap((line) => {
    const row = rowById(line.item.id);
    if (!row) {
      return [];
    }
    return [
      {
        row,
        number: state.rows.indexOf(row) + 1,
        label: line.item.label,
        colour: row.colour,
        shape: symbols.get(row) ?? DEFAULT_SHAPE,
        position: { x: 0, y: 0 },
      },
    ];
  });
  renderGlanceEntries('presentation', entries, state.presentationSelected, choosePresentationEntry);
}

// The timeline (FR-67): its view is created on first use.
let timeline: TimelineView | null = null;
// A saved view waits until the timeline is next drawn.
let timelinePending = true;

// A schedule view is shown: the timeline (FR-67) or the costs view (FR-79),
// which share the line, lane, window, and saved-view machinery.
function timelineMode(): boolean {
  return state.presentationMode !== 'map';
}

// The schedule view shown, if any.
function schedule(): TimelineView | null {
  return state.presentationMode === 'timeline' ? timeline : state.presentationMode === 'costs' ? costs : null;
}

function setPresentationOrder(order: PresentationOrder): void {
  if (state.presentationOrder === order) {
    return;
  }
  state.presentationOrder = order;
  markDirty();
  renderPresentation();
}

function setPresentationMode(mode: PresentationMode): void {
  if (state.presentationMode === mode) {
    return;
  }
  state.presentationMode = mode;
  if (cardId !== null) {
    closeCard();
  }
  markDirty();
  renderPresentation();
  // The legend follows the view: the costs view's series key appears only
  // when the costs view is shown (FR-79 as amended).
  renderLegends();
}

// The costs view's saved view (FR-79), beside the timeline's.
let costs: TimelineView | null = null;
let costsPending = true;

export function restoreCostsView(view: TimelineWindow | null): void {
  state.costsRestore = view ? { ...view } : null;
  costsPending = true;
}

// The costs view's view to save, like the timeline's: its own window and
// first visible line, or null while it is the fitted view at the top.
export function currentCostsView(): TimelineWindow | null {
  if (costsPending || !costs) {
    return state.costsRestore ? { ...state.costsRestore } : null;
  }
  const firstLine = costs.firstLine();
  if (!costs.isChosen() && firstLine === 0) {
    return null;
  }
  return { ...costs.window, firstLine };
}

export function restoreTimelineView(view: TimelineWindow | null): void {
  state.timelineRestore = view ? { ...view } : null;
  timelinePending = true;
}

// The timeline's view to save: the time window and the first visible line,
// or null while it is the fitted view at the top.
export function currentTimelineView(): TimelineWindow | null {
  if (timelinePending || !timeline) {
    return state.timelineRestore ? { ...state.timelineRestore } : null;
  }
  const firstLine = timeline.firstLine();
  if (!timeline.isChosen() && firstLine === 0) {
    return null;
  }
  return { ...timeline.window, firstLine };
}

export function timelineItems(): TimelineItem[] {
  const { start, end, area } = state.roles;
  const value = (row: RowData, key: string | undefined) => (key === undefined ? '' : (row.values[key] ?? ''));
  // Every item of the presentation, with or without a marker; items switched
  // off are absent (FR-67).
  return numbered()
    .filter((n) => !state.excluded.has(n.row))
    .map((n) => ({
      id: rowId(n.row),
      label: n.label,
      name: itemLabel(n.row, n.label),
      colour: n.row.colour,
      area: value(n.row, area).trim(),
      start: value(n.row, start),
      end: value(n.row, end),
      // The item's activities (FR-78), or absent for none.
      ...(state.activities.get(n.row)?.length ? { activities: state.activities.get(n.row)!.map((a) => ({ ...a })) } : {}),
      ...(workPhaseOf(n.row) !== undefined ? { workPhase: workPhaseOf(n.row) } : {}),
    }));
}

// A schedule view on its layer of the stage, with the callbacks the
// timeline and the costs view share.
function newScheduleView(id: string, kind: 'timeline' | 'costs'): TimelineView {
  const view = new TimelineView(
    el(id),
    {
      onSelect: (rowId) => openCard(rowId),
      onHover: setHover,
      onViewChanged: () => {
        renderZoomLevel();
        renderPresentationGlance();
        renderCard();
      },
      badge: (line: TimelineLine) => {
        const row = rowById(line.item.id);
        const shape = (row && effectiveSymbols().get(row)) ?? DEFAULT_SHAPE;
        const badge = document.createElement('span');
        badge.className = `marker-badge marker-${line.item.colour} ${symbolClasses(shape)}`;
        drawSymbol(badge, shape, line.item.label);
        return badge;
      },
    },
    kind,
  );
  // A click on the view outside a line closes the card.
  el(id).addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.timeline-entry') && cardId !== null) {
      closeCard();
    }
  });
  return view;
}

function scheduleLabels(): TimelineLabels {
  const t = strings(state.prefs.lang);
  const { start, end } = state.roles;
  return {
    noDates: t.timelineNoDates,
    noArea: t.numberingNoArea,
    empty: t.timelineEmpty,
    noRoles: null,
    startOnly: t.timelineStartOnly,
    endOnly: t.timelineEndOnly,
    startHeader: start === undefined ? '' : labelOf(start),
    endHeader: end === undefined ? '' : labelOf(end),
    locale: areaLocale(),
    expand: t.timelineExpand,
    activities: t.timelineActivities,
    edited: t.activityEdited,
    workPhase: t.legendWorkPhase,
    events: t.eventPanel,
    moreEvents: t.eventsMore,
    eventsBefore: t.eventsBefore,
    eventsAfter: t.eventsAfter,
    today: t.todayMark,
    todayBefore: t.todayBefore,
    todayAfter: t.todayAfter,
  };
}

// The events as drawn in the schedule views (FR-80): those whose date reads,
// each at its date's first day; one that cannot be read is not drawn.
export function scheduleEvents(): ScheduleEvent[] {
  return state.events.flatMap((e) => {
    const reading = readDate(e.date);
    return reading.kind === 'date' ? [{ id: e.id, label: e.label, day: reading.start, date: formatDate(reading) }] : [];
  });
}

function renderTimeline(): void {
  if (!timeline) {
    timeline = newScheduleView('presentation-timeline', 'timeline');
  }
  const t = strings(state.prefs.lang);
  const { start, end } = state.roles;
  const model = buildTimeline(timelineItems(), state.presentationOrder, state.areaValues, areaLocale());
  timeline.render(
    model,
    { ...scheduleLabels(), noRoles: start === undefined && end === undefined && model.lines.length > 0 ? t.timelineNoRoles : null },
    state.presentationSelected,
    scheduleEvents(),
    todayDay(),
  );
  if (timelinePending) {
    timelinePending = false;
    const saved = state.timelineRestore;
    state.timelineRestore = null;
    timeline.setWindow(saved ? { from: saved.from, to: saved.to } : null, saved?.firstLine ?? 0);
  }
}

// The costs view's items (FR-79): every item of the presentation, with the
// year amounts of the assigned series read as numbers (FR-65); a value that
// is not a number is kept as typed and has no bar.
function costsItems(series: SeriesAssignments): CostsItem[] {
  return timelineItems().map(({ activities: _activities, ...item }) => {
    const row = rowById(item.id)!;
    const amounts: CostsItem['amounts'] = [];
    const typed: CostsItem['typed'] = [];
    for (const role of SERIES_ROLES) {
      for (const [year, key] of Object.entries(series[role]?.columns ?? {})) {
        const reading = readAmount(row.values[key] ?? '', state.currencyUnit);
        if (reading.kind === 'number') {
          amounts.push({ series: role, year: Number(year), value: reading.value, decimals: reading.decimals });
        } else if (reading.kind === 'text') {
          typed.push({ series: role, year: Number(year), text: reading.text });
        }
      }
    }
    return { ...item, amounts, typed };
  });
}

function renderCosts(): void {
  if (!costs) {
    costs = newScheduleView('presentation-costs', 'costs');
  }
  const t = strings(state.prefs.lang);
  const series = effectiveSeries();
  const years = [...new Set(SERIES_ROLES.flatMap((role) => Object.keys(series[role]?.columns ?? {}).map(Number)))];
  const model = buildCosts(costsItems(series), years, state.presentationOrder, state.areaValues, areaLocale());
  const format = { locale: areaLocale(), unit: state.currencyUnit };
  const roleNames: Record<SeriesRole, string> = { budget: t.seriesRoleBudget, forecast: t.seriesRoleForecast, outcome: t.seriesRoleOutcome };
  costs.render(
    model,
    {
      ...scheduleLabels(),
      noRoles: years.length === 0 && model.lines.length > 0 ? t.costsNoSeries : null,
      expand: t.costsExpand,
      costs: {
        // The series in the user's own words (FR-63).
        series: Object.fromEntries(SERIES_ROLES.map((role) => [role, series[role]?.name ?? roleNames[role]])) as Record<SeriesRole, string>,
        thousands: (value) => new Intl.NumberFormat(format.locale, { maximumFractionDigits: 0 }).format(inThousands(value)),
        exact: (a) => formatAmount(a.value, a.decimals, format),
        totals: t.costsTotals,
        unitNote: fill(t.costsUnitNote, { unit: state.currencyUnit }).trim(),
        totalsDescription: t.costsTotalsDescription,
        none: t.costsNone,
        typed: t.costsTyped,
        noBudget: t.costsNoBudget,
      },
    },
    state.presentationSelected,
    scheduleEvents(),
    todayDay(),
  );
  if (costsPending) {
    costsPending = false;
    const saved = state.costsRestore;
    state.costsRestore = null;
    costs.setWindow(saved ? { from: saved.from, to: saved.to } : null, saved?.firstLine ?? 0);
  }
}

function initialisePresentation(): void {
  presentationView = new MapView(
    el('presentation-stage'),
    el('presentation-content'),
    el<HTMLImageElement>('presentation-image'),
    {
      onError: () => undefined,
      onBackgroundChanged: () => {
        renderPresentation();
        renderPresentationAnnotations();
      },
      onViewportChanged: () => {
        renderPresentation();
        renderPresentationAnnotations();
      },
    },
    { panOverMarkers: true },
  );
  presentationAnnotations = new AnnotationLayer(
    el('presentation-annotations') as unknown as SVGSVGElement,
    el('presentation-annotation-labels'),
    () => presentationView?.viewport ?? { scale: 1, x: 0, y: 0 },
  );
  presentationLayer = new MarkerLayer(el('presentation-marker-layer'), {
    editable: false,
    viewport: () => presentationView?.viewport ?? { scale: 1, x: 0, y: 0 },
    stagePoint: (x, y) => presentationView?.stagePoint(x, y) ?? { x, y },
    rowId: (marker) => rowId(marker.row),
    symbolSource: (marker) => symbolSource(marker.row),
    markerLabel,
    onSelect: (id) => openCard(id),
    onMove: () => undefined,
    onRemove: () => undefined,
    onHover: setHover,
  });
  const card = el('presentation-card');
  // The card is not part of the stage's pan and zoom.
  card.addEventListener('pointerdown', (e) => e.stopPropagation());
  card.addEventListener('wheel', (e) => e.stopPropagation());
  el('presentation-stage').addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && cardId !== null) {
      closeCard();
    }
  });
  // The toolbar acts on the view shown (FR-66); on the timeline, Reset is
  // Fit (FR-67).
  el('pres-zoom-in').addEventListener('click', () => (timelineMode() ? schedule()?.zoomBy(BUTTON_ZOOM_FACTOR) : presentationView?.zoomBy(BUTTON_ZOOM_FACTOR)));
  el('pres-zoom-out').addEventListener('click', () =>
    timelineMode() ? schedule()?.zoomBy(1 / BUTTON_ZOOM_FACTOR) : presentationView?.zoomBy(1 / BUTTON_ZOOM_FACTOR),
  );
  el('pres-fit').addEventListener('click', () => (timelineMode() ? schedule()?.fit() : presentationView?.fit()));
  el('pres-reset').addEventListener('click', () => (timelineMode() ? schedule()?.fit() : presentationView?.reset()));
  for (const button of document.querySelectorAll<HTMLButtonElement>('.pres-mode-button')) {
    button.addEventListener('click', () => setPresentationMode(button.dataset.mode as PresentationMode));
  }
  el<HTMLSelectElement>('pres-order').addEventListener('change', (e) => setPresentationOrder((e.target as HTMLSelectElement).value as PresentationOrder));
  el('export-open').addEventListener('click', openExportDialog);
  el('activity-choose').addEventListener('click', () => el<HTMLInputElement>('activity-file-input').click());
  el('activity-file-input').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      void onActivityFile(file);
    }
    input.value = '';
  });
  el('activity-close').addEventListener('click', closeActivityDialog);
  el('activity-cancel').addEventListener('click', closeActivityDialog);
  el('activity-go').addEventListener('click', confirmActivityImport);
  el('activity-phase').addEventListener('change', (e) => {
    if (activityDialog) {
      activityDialog.phase = (e.target as HTMLSelectElement).value;
    }
  });
  el('activity-panel').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeActivityDialog();
    }
  });
  el('pdf-open').addEventListener('click', () => void openDocumentDialog('pdf'));
  el('pptx-open').addEventListener('click', () => void openDocumentDialog('pptx'));
  el('document-go').addEventListener('click', () => void runDocumentExport());
  el('document-cancel').addEventListener('click', closeDocumentDialog);
  el('export-cancel').addEventListener('click', closeExportDialog);
  el('export-close').addEventListener('click', closeExportDialog);
  el('export-go').addEventListener('click', () => void runExport());
  el('export-panel').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeExportDialog();
    }
  });
  const stage = el('presentation-stage');
  stage.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.marker')) {
      return;
    }
    if (cardId !== null || state.presentationSelected !== null) {
      closeCard();
    }
  });
  // A stage, not an editor: nothing can be dropped here. Default handling is
  // prevented so that a dropped file is not opened by the browser either.
  stage.addEventListener('dragover', (e) => e.preventDefault());
  stage.addEventListener('drop', (e) => e.preventDefault());
}

function renderMapControls(): void {
  renderAnnotationToolbar();
  const view = mapView;
  const has = view?.background !== null && view?.background !== undefined;
  for (const id of ['map-zoom-in', 'map-zoom-out', 'map-fit', 'map-reset']) {
    el<HTMLButtonElement>(id).disabled = !has;
  }
  el('map-zoom-level').textContent = `${Math.round((view?.viewport.scale ?? 1) * 100)}%`;
  el('map-empty').classList.toggle('hidden', has);
}

let pdfDocument: PdfDocument | null = null;

export async function closePdf(): Promise<void> {
  const doc = pdfDocument;
  pdfDocument = null;
  hideDialog('pdf-panel');
  el('pdf-status').textContent = '';
  if (doc) {
    await doc.close().catch(() => undefined);
  }
}

function setPdfBusy(busy: boolean): void {
  el<HTMLButtonElement>('pdf-use').disabled = busy;
  el<HTMLSelectElement>('pdf-page').disabled = busy;
  el('pdf-status').textContent = busy ? strings(state.prefs.lang).pdfRendering : '';
}

// Renders the chosen page and hands it to the map view as the background
// image, on the same viewport machinery as an image file (FR-25).
async function usePdfPage(page: number): Promise<void> {
  const doc = pdfDocument;
  if (!doc || !mapView) {
    return;
  }
  setPdfBusy(true);
  let src: string;
  try {
    src = await doc.renderPage(page);
  } catch {
    setPdfBusy(false);
    showMapError('pdf-render');
    return;
  }
  await closePdf();
  setPdfBusy(false);
  await mapView.setBackgroundSource(src);
}

async function loadPdfFile(file: File): Promise<void> {
  if (file.size > MAX_IMPORT_BYTES) {
    showMapError('pdf-too-large');
    return;
  }
  await closePdf();
  let doc: PdfDocument;
  try {
    doc = await openPdf(await file.arrayBuffer());
  } catch {
    showMapError('pdf-unreadable');
    return;
  }
  if (doc.pageCount < 1) {
    await doc.close().catch(() => undefined);
    showMapError('pdf-unreadable');
    return;
  }
  pdfDocument = doc;
  const select = el<HTMLSelectElement>('pdf-page');
  select.innerHTML = '';
  for (let page = 1; page <= doc.pageCount; page++) {
    const opt = document.createElement('option');
    opt.value = String(page);
    opt.textContent = String(page);
    select.appendChild(opt);
  }
  select.value = '1';
  el('pdf-page-count').textContent = `${strings(state.prefs.lang).pdfPageCount} ${doc.pageCount}`;
  setPdfBusy(false);
  if (doc.pageCount === 1) {
    await usePdfPage(1);
    return;
  }
  showDialog('pdf-panel');
  select.focus();
}

// OpenStreetMap data (FR-31): parsed locally and rendered to an image that
// becomes the background like an image file or a PDF page.
type OsmOutcome = 'ok' | 'malformed' | 'empty' | 'render' | 'decode';

// Renders OpenStreetMap data as the background. A local file reports its
// failures in the map area; a fetch reports them in its own panel.
export async function useOsmText(text: string, fetched?: { bounds: OsmBounds; attribution: string }): Promise<OsmOutcome> {
  let src: string;
  let projection: MercatorProjection | undefined;
  try {
    const data = parseOsm(text);
    // Fetched data carries no bounds element: the requested area is the extent.
    if (fetched) {
      data.bounds = fetched.bounds;
    }
    const plan = planRender(data);
    projection = plan.projection;
    src = renderPlanToDataUrl(plan, fetched?.attribution);
  } catch (e) {
    const outcome: OsmOutcome = e instanceof OsmError ? (e.code === 'empty' ? 'empty' : 'malformed') : 'render';
    if (!fetched) {
      showMapError(outcome === 'empty' ? 'osm-empty' : outcome === 'malformed' ? 'osm-malformed' : 'osm-render');
    }
    return outcome;
  }
  await closePdf();
  // The rendering's projection makes its scale known (FR-49).
  return (await mapView?.setBackgroundSource(src, undefined, projection)) ? 'ok' : 'decode';
}

async function loadOsmFile(file: File): Promise<void> {
  if (file.size > MAX_OSM_BYTES) {
    showMapError('osm-too-large');
    return;
  }
  let text: string;
  try {
    text = await readText(file);
  } catch {
    showMapError('unreadable');
    return;
  }
  await useOsmText(text);
}

async function loadBackgroundFile(file: File): Promise<void> {
  showMapError(null);
  if (isOsmFile(file)) {
    await loadOsmFile(file);
  } else if (isPdfFile(file)) {
    await loadPdfFile(file);
  } else {
    await mapView?.loadImageFile(file);
  }
}

function initialiseMapView(): void {
  mapView = new MapView(
    el('map-stage'),
    el('map-content'),
    el<HTMLImageElement>('map-image'),
    {
      onError: (kind) => showMapError(kind),
      onBackgroundChanged: () => {
        markDirty();
        syncPresentationBackground();
        renderMapControls();
        renderWorkStatus();
        renderComparison();
      },
      onViewportChanged: () => {
        renderMapControls();
        renderMapItems();
      },
    },
    { panFilter: (e) => drawingTools?.allowsPan(e) ?? true },
  );
  mapAnnotations = new AnnotationLayer(
    el('map-annotations') as unknown as SVGSVGElement,
    el('map-annotation-labels'),
    () => mapView?.viewport ?? { scale: 1, x: 0, y: 0 },
    el('map-annotation-handles'),
  );
  drawingTools = new DrawingTools(el('map-stage'), {
    viewport: () => mapView?.viewport ?? { scale: 1, x: 0, y: 0 },
    stagePoint: (x, y) => mapView?.stagePoint(x, y) ?? { x, y },
    hasBackground: () => mapView?.background !== null && mapView?.background !== undefined,
    style: () => ({ ...state.annotationStyle }),
    onDraft: (draft, cursor) => {
      annotationDraft = { draft, cursor };
      renderAnnotations();
      renderAnnotationToolbar();
    },
    onCreate: createAnnotation,
    editable: () => state.annotations,
    selectedId: () => state.selectedAnnotation,
    onSelect: selectAnnotation,
    onChange: (annotation, final) => {
      replaceAnnotation(annotation);
      if (final) {
        markDirty();
      }
      renderAnnotations();
      if (final) {
        renderAnnotationInspector();
      }
    },
    touch: () => narrowApplication(),
  });
  wireAnnotationToolbar();
  markerLayer = new MarkerLayer(el('marker-layer'), {
    editable: true,
    isExcluded: (marker) => state.excluded.has(marker.row),
    onHover: setHover,
    viewport: () => mapView?.viewport ?? { scale: 1, x: 0, y: 0 },
    stagePoint: (x, y) => mapView?.stagePoint(x, y) ?? { x, y },
    rowId: (marker) => rowId(marker.row),
    symbolSource: (marker) => symbolSource(marker.row),
    markerLabel,
    onSelect: selectMarker,
    onMove: moveMarker,
    onRemove: deleteMarker,
  });
  renderMapControls();

  const fileInput = el<HTMLInputElement>('map-file-input');
  el('map-load').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) {
      void loadBackgroundFile(file);
    }
    fileInput.value = '';
  });
  el('map-zoom-in').addEventListener('click', () => mapView?.zoomBy(BUTTON_ZOOM_FACTOR));
  el('map-zoom-out').addEventListener('click', () => mapView?.zoomBy(1 / BUTTON_ZOOM_FACTOR));
  el('map-fit').addEventListener('click', () => mapView?.fit());
  el('map-reset').addEventListener('click', () => mapView?.reset());
  el('pdf-use').addEventListener('click', () => {
    void usePdfPage(Number(el<HTMLSelectElement>('pdf-page').value));
  });
  el('pdf-cancel').addEventListener('click', () => void closePdf());
  el('marker-shape').addEventListener('change', (e) => {
    const value = (e.target as HTMLSelectElement).value;
    const row = state.selectedMarker ? rowById(state.selectedMarker) : undefined;
    if (!row || !isSymbol(value)) {
      return;
    }
    state.shapes.set(row, value);
    markDirty();
    renderMapItems();
    renderDetailsPanel();
  });
  el('marker-remove').addEventListener('click', () => {
    if (state.selectedMarker) {
      deleteMarker(state.selectedMarker);
    }
  });

  const stage = el('map-stage');
  stage.addEventListener('dragover', (e) => {
    e.preventDefault();
    stage.classList.add('dragover');
  });
  stage.addEventListener('dragleave', () => stage.classList.remove('dragover'));
  // Tap-to-place (FR-73): a tap on the stage, not a pan or a pinch, places
  // the waiting item through the drop's own placement.
  stage.addEventListener(
    'pointerdown',
    (e) => {
      if (placingId === null) {
        return;
      }
      placingDown = e.isPrimary ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
    },
    true,
  );
  stage.addEventListener(
    'pointerup',
    (e) => {
      const down = placingDown;
      placingDown = null;
      if (placingId === null || !down || down.id !== e.pointerId) {
        return;
      }
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP) {
        return;
      }
      const id = placingId;
      placingId = null;
      dropRowOnMap(id, e.clientX, e.clientY);
      renderPlacing();
    },
    true,
  );
  stage.addEventListener('pointercancel', () => (placingDown = null), true);
  el('place-cancel').addEventListener('click', () => stopPlacing());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && placingId !== null) {
      stopPlacing();
    }
  });
  stage.addEventListener('pointerdown', (e) => {
    if (!(e.target as HTMLElement).closest('.marker') && state.selectedMarker) {
      selectMarker(null);
    }
  });
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    stage.classList.remove('dragover');
    const draggedRow = e.dataTransfer?.getData(ROW_DRAG_TYPE);
    if (draggedRow) {
      dropRowOnMap(draggedRow, e.clientX, e.clientY);
      return;
    }
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      void loadBackgroundFile(file);
    }
  });
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
  viewerView = { viewport: { ...data.workState.viewport }, ...(data.stage ? { stage: { ...data.stage } } : {}) };
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
function narrowViewer(): boolean {
  return (narrow?.active() ?? false) || narrowApplication();
}

function closeNarrowOverlay(): void {
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
