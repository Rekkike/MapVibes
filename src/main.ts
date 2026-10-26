import { selfPage } from './selfsource';
import { applyFilter, counters, COLOURS, makeRow, numberRows, NO_FILTER, sortRows, type NumberedRow, type RowColour, type RowData, type SortDirection, type ValueFilter } from './dataset';
import { importColumns, parseWorkbook, ParseError, type ParseResult } from './ingest';
import { columnLabel } from './columns';
import { emptyValues, newManualKey } from './manual';
import { addStatus, statusSymbol, addValue, collectValues, hasValue, mergeValues, moveStatus, removeStatus, removeValue, renameStatus, renameValue, setStatusSymbol, statusNames, type StatusEntry } from './vocab';
import { clonePreset, findMatchingPreset, loadStoredPresets, presetConfiguration, presetMatches, removePreset, storePresets, upsertPreset, type ColumnPreset } from './presets';
import { assignRole, displayName, isRole, listColumnOrder, roleOfColumn, ROLES, type Role, type RoleAssignments } from './roles';
import { strings, type Lang, type Strings } from './i18n';
import { loadPreferences, savePreferences, type Preferences, type ThemeChoice } from './preferences';
import { MapView } from './mapview';
import { isPdfFile, openPdf, type PdfDocument } from './pdfbackground';
import { isOsmFile, MAX_OSM_BYTES, OsmError, parseOsm, planRender, type OsmBounds } from './osm';
import { renderPlanToDataUrl } from './osmrender';
import { fetchableBounds, FetchError, fetchMapData, isOnline, parseBounds, searchPlace, type BoundsField, type FetchErrorCode, type PlaceResult } from './openmap';
import { MarkerLayer } from './markerlayer';
import { colourName, renderLegend, shapeName, type LegendAreaGroup } from './legend';
import { addComment, commentsOf, formatCommentDate, removeComment, restoreComments, type CommentStore } from './comments';
import { renderDetails, type DetailField, type DetailLabels, type DetailModel } from './details';
import { drawSymbol, isSymbol, SYMBOLS, symbolClasses, type MarkerSymbol } from './symbols';
import { markersInView } from './glance';
import { DEFAULT_SHAPE, placedMarkers, placeMarker, pruneMarkers, removeMarker, type MarkerPositions, type MarkerShapes, type PlacedMarker } from './markers';
import { BUTTON_ZOOM_FACTOR, imageToScreen, screenToImage, type Point } from './viewport';
import { isSegment, SEGMENTS, showSegment, type Segment } from './segments';
import { type Problem, parseWorkState, rowNumbers, serialiseWorkState, SUGGESTED_FILE_NAME, WorkStateError, type WorkState } from './workstate';
import { ExportError, parseExport, serialiseExport, SUGGESTED_EXPORT_NAME, type ExportData } from './exportfile';
import { embedDataIsland, readDataIsland } from './singlefile';
import { compareItems, type CompareItem, type Comparison } from './reconcile';
import { areaGroups, groupedLabels } from './grouping';
import { DEMO_MAP_TEXT, demoScenario, demoWorkbook } from './demo';

const DEFAULT_COLOUR: RowColour = 'green';

interface AppState {
  prefs: Preferences;
  roles: RoleAssignments;
  // Manual columns (FR-24): key to label; and the rows added by hand (FR-9).
  manualColumns: Map<string, string>;
  manualRows: Set<RowData>;
  // The user's area vocabulary (FR-32): empty until the user fills it.
  areaValues: string[];
  // The user's status vocabulary (FR-33): empty until the user fills it.
  statuses: StatusEntry[];
  // FR-34: assign marker symbols from status; off by default.
  symbolsFromStatus: boolean;
  // Saved column presets (FR-23), latest last, and the preset in effect.
  presets: ColumnPreset[];
  activePreset: string | null;
  headers: string[];
  // All ingested rows in ingestion order, retained and removed.
  ingested: RowData[];
  // The retained rows, in ingestion order: the numbered list (FR-3).
  rows: RowData[];
  visibleHeaders: string[];
  hiddenHeaders: Set<string>;
  filter: ValueFilter;
  sort: { header: string | null; direction: SortDirection };
  selected: Set<string>;
  nextRowId: number;
  rowIds: Map<RowData, string>;
  segment: Segment;
  positions: MarkerPositions;
  // Marker shapes (FR-26), per marker; circle where unset.
  shapes: MarkerShapes;
  selectedMarker: string | null;
  // True when the work has changed since it was last saved or opened.
  dirty: boolean;
  // Items switched off for the presentation (FR-27).
  excluded: Set<RowData>;
  // The item selected on the presentation stage.
  presentationSelected: string | null;
  // The item whose details panel is open (FR-7), if any.
  detailsId: string | null;
  // The comments of each item (FR-15).
  comments: CommentStore;
  // The imported values edited by hand (FR-10), with their imported value.
  edited: Map<RowData, Record<string, string>>;
  // The exported viewer (FR-38): view-only, with the numbers the items have
  // in the exported presentation.
  viewOnly: boolean;
  numbers: Map<RowData, number> | null;
  // The numbers shown in the exported viewer, when they differ from the
  // numbers (the grouped numbering, FR-17).
  viewerLabels: Map<RowData, string> | null;
  // The numbering mode (FR-3, FR-17): global by default, or grouped by area.
  numbering: 'global' | 'grouped';
  // The list view (FR-17): flat, or grouped by area in collapsible sections;
  // the area values whose sections are collapsed.
  listView: 'flat' | 'grouped';
  collapsedAreas: Set<string>;
}

const state: AppState = {
  prefs: loadPreferences(),
  roles: {},
  manualColumns: new Map(),
  manualRows: new Set(),
  areaValues: [],
  statuses: [],
  symbolsFromStatus: false,
  presets: loadStoredPresets(),
  activePreset: null,
  headers: [],
  ingested: [],
  rows: [],
  visibleHeaders: [],
  hiddenHeaders: new Set(),
  filter: { ...NO_FILTER },
  sort: { header: null, direction: 'asc' },
  selected: new Set(),
  nextRowId: 1,
  rowIds: new Map(),
  segment: 'information',
  positions: new Map(),
  shapes: new Map(),
  selectedMarker: null,
  dirty: false,
  excluded: new Set(),
  presentationSelected: null,
  detailsId: null,
  comments: new Map(),
  edited: new Map(),
  viewOnly: false,
  numbers: null,
  viewerLabels: null,
  numbering: 'global',
  listView: 'flat',
  collapsedAreas: new Set(),
};

// Drag-and-drop data type identifying a list row dragged onto the map.
export const ROW_DRAG_TYPE = 'application/x-mapvibes-row';

function rowId(row: RowData): string {
  let id = state.rowIds.get(row);
  if (!id) {
    id = `row-${state.nextRowId++}`;
    state.rowIds.set(row, id);
  }
  return id;
}

function rowById(id: string): RowData | undefined {
  return state.rows.find((r) => state.rowIds.get(r) === id);
}

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing element #${id}`);
  return e as T;
}

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
  for (const [id, label] of [['map-zoom-in', t.mapZoomIn], ['map-zoom-out', t.mapZoomOut]] as const) {
    el(id).setAttribute('aria-label', label);
    el(id).title = label;
  }
  el('map-fit').textContent = t.mapFit;
  el('map-reset').textContent = t.mapReset;
  el('map-empty-hint').textContent = t.mapEmptyHint;
  el('marker-remove').textContent = t.markerRemove;
  el('marker-shape-text').textContent = t.markerShape;
  el('work-save').textContent = t.workSave;
  el('area-panel-summary').textContent = t.areaPanel;
  el('area-panel-hint').textContent = t.areaPanelHint;
  el('area-new').setAttribute('aria-label', t.areaNew);
  el<HTMLInputElement>('area-new').placeholder = t.areaNew;
  el('area-add').textContent = t.vocabAdd;
  el('area-collect').textContent = t.areaCollect;
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
  el('visibility-heading').textContent = t.visibilityHeading;
  el('visibility-hint').textContent = t.visibilityHint;
  el('visibility-empty').textContent = t.visibilityEmpty;
  el('presentation-empty-hint').textContent = t.presentationEmptyHint;
  el('pres-fit').textContent = t.mapFit;
  el('export-open').textContent = t.exportOpen;
  el('export-heading').textContent = t.exportHeading;
  el('export-intro').textContent = t.exportIntro;
  el('export-contains-heading').textContent = t.exportContainsHeading;
  el('export-omitted-heading').textContent = t.exportOmittedHeading;
  el('export-go').textContent = t.exportGo;
  el('export-cancel').textContent = t.exportCancel;
  el('pres-reset').textContent = t.mapReset;
  for (const [id, label] of [['pres-zoom-in', t.mapZoomIn], ['pres-zoom-out', t.mapZoomOut]] as const) {
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
  el('placement-hint').textContent = t.placementHint;
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
  const themeOptions = el<HTMLSelectElement>('select-theme').options;
  const themeLabels: Record<string, string> = { system: t.themeSystem, light: t.themeLight, dark: t.themeDark };
  for (const option of themeOptions) option.textContent = themeLabels[option.value] ?? option.textContent;
  const filterKind = el<HTMLSelectElement>('select-filter-kind');
  const options = filterKind.options;
  options[0].textContent = t.filterAll;
  options[1].textContent = t.filterEmpty;
  options[2].textContent = t.filterNonEmpty;
  options[3].textContent = t.filterContains;
}

function currentCounters() {
  return counters(state.ingested.length, state.rows.length);
}

function setLanguage(lang: Lang): void {
  state.prefs.lang = lang;
  // Choices made in the exported viewer are not remembered (FR-20).
  if (!state.viewOnly) savePreferences(state.prefs);
  el<HTMLSelectElement>('select-language').value = lang;
  renderStaticText();
  renderList();
  renderExport();
  renderViewerBadge();
}

function setTheme(theme: ThemeChoice): void {
  state.prefs.theme = theme;
  if (!state.viewOnly) savePreferences(state.prefs);
  el<HTMLSelectElement>('select-theme').value = theme;
  applyTheme(theme);
}

function initialisePreferences(): void {
  el<HTMLSelectElement>('select-language').value = state.prefs.lang;
  el<HTMLSelectElement>('select-theme').value = state.prefs.theme;
  applyTheme(state.prefs.theme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.prefs.theme === 'system') applyTheme('system');
  });
}

// Direct import (FR-1): the list is populated immediately with every column
// of the file. Importing over unsaved work asks for confirmation first, as
// opening a work-state file does.
async function handleFile(file: File): Promise<void> {
  const errorEl = el('ingest-error');
  errorEl.classList.add('hidden');
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
  if (state.dirty && !window.confirm(strings(state.prefs.lang).importConfirmReplace)) return;
  applyImport(parse);
}

function applyImport(parse: ParseResult): void {
  const { headers, rows } = importColumns(parse);
  resetList(headers, rows);
  const preset = findMatchingPreset(state.presets, headers);
  if (preset) applyPreset(preset, 'auto');
  renderList();
}

// The full-test demo (FR-41): the fictional example scenario, loaded through
// the normal paths: the demo's column preset is saved, the demo list is
// imported (so the preset applies the roles and vocabularies as it would to
// any matching import), the town map renders as an .osm background, and the
// scenario adds the colours, comments, and markers. It is unsaved work,
// labelled as example data until other work replaces it.
let demoLoaded = false;

export async function loadDemo(): Promise<boolean> {
  const t = strings(state.prefs.lang);
  if (state.dirty && !window.confirm(t.demoConfirmReplace)) return false;
  const scenario = demoScenario();
  state.presets = upsertPreset(state.presets, scenario.preset);
  storePresets(state.presets);
  el('ingest-error').classList.add('hidden');
  applyImport(parseWorkbook(demoWorkbook()));
  state.symbolsFromStatus = scenario.symbolsFromStatus;
  const idKey = state.roles.identifier;
  const rowOf = (item: string) => (idKey === undefined ? undefined : state.rows.find((r) => r.values[idKey] === item));
  for (const item of scenario.items) {
    const row = rowOf(item.item);
    if (!row) continue;
    row.colour = item.colour;
    if (item.comments.length > 0) state.comments.set(row, restoreComments(item.comments));
  }
  const outcome = await useOsmText(DEMO_MAP_TEXT);
  const bg = mapView?.background;
  if (outcome === 'ok' && bg) {
    for (const item of scenario.items) {
      const row = rowOf(item.item);
      if (!row || !item.position) continue;
      placeMarker(state.positions, row, { x: item.position[0] * bg.width, y: item.position[1] * bg.height });
      if (item.symbol) state.shapes.set(row, item.symbol);
    }
  }
  demoLoaded = true;
  markDirty();
  workMessage = 'demo-loaded';
  renderList();
  setSegment('map');
  return outcome === 'ok';
}

// Starts an empty list with no import (FR-30); rows and columns are then
// added by hand.
function startEmptyList(): void {
  if (state.dirty && !window.confirm(strings(state.prefs.lang).manualConfirmReplace)) return;
  el('ingest-error').classList.add('hidden');
  resetList([], []);
  renderList();
}

function resetList(headers: string[], rows: Record<string, string>[]): void {
  demoLoaded = false;
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
function labelOf(key: string): string {
  const t = strings(state.prefs.lang);
  const manual = state.manualColumns.get(key);
  if (manual !== undefined) return manual.trim() === '' ? t.untitledHeader : manual;
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
  if (label === '') return;
  const key = newManualKey(state.headers);
  state.manualColumns.set(key, label);
  state.headers = [...state.headers, key];
  state.visibleHeaders = [...state.headers];
  for (const row of state.ingested) row.values[key] = '';
  input.value = '';
  markDirty();
  renderList();
}

function renameManualColumn(key: string, label: string): void {
  if (!state.manualColumns.has(key) || label.trim() === '') return;
  state.manualColumns.set(key, label.trim());
  markDirty();
  renderList();
}

// Every value is edited by hand (FR-10), imported values included, in the
// list and in the details panel; an edit is an unsaved change. The cells of
// the area column are choose-from comboboxes and those of the status column
// choose from the status list (FR-32, FR-33).
function setCellValue(row: RowData, key: string, value: string): void {
  if (key === state.roles.area) value = value.trim();
  if (row.values[key] === value) return;
  noteEdit(row, key, value);
  // A new value typed into the area column joins the area vocabulary.
  if (key === state.roles.area) state.areaValues = addValue(state.areaValues, value);
  row.values[key] = value;
  markDirty();
  renderList();
}

// The grouped numbering applies while it is chosen and the area role is
// assigned (FR-17); without the area role the global numbering applies and
// the list says why.
function groupedNumbering(): boolean {
  return state.numbering === 'grouped' && state.roles.area !== undefined;
}

// The numbered rows (FR-3, FR-17): the global sequential numbers, shown as
// such or as grouped numbers; in the exported viewer the numbers of the
// exported presentation (FR-38). One source for the list, the markers, and
// every panel.
function numbered(): NumberedRow[] {
  const numbers = state.numbers;
  if (numbers !== null) {
    return state.rows.map((row, i) => {
      const number = numbers.get(row) ?? i + 1;
      return { row, number, label: state.viewerLabels?.get(row) ?? String(number) };
    });
  }
  const rows = numberRows(state.rows);
  if (!groupedNumbering()) return rows;
  const labels = groupedLabels(state.rows, state.roles.area!, state.areaValues);
  return rows.map((n) => ({ ...n, label: labels.get(n.row) ?? n.label }));
}

// The number of a row as shown.
function numberLabel(row: RowData): string {
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
  if (!groupedView()) return [{ area: null, index: 0, rows, collapsed: false }];
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
    if (state.collapsedAreas.has(area)) state.collapsedAreas.delete(area);
    else state.collapsedAreas.add(area);
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

function renderList(): void {
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
  const roleLabels: Record<Role, string> = {
    identifier: t.roleIdentifier,
    name: t.roleName,
    start: t.roleStart,
    end: t.roleEnd,
    area: t.roleArea,
    status: t.roleStatus,
  };
  columns.forEach((header) => {
    const th = document.createElement('th');
    const labelText = labelOf(header);
    const role = roleOfColumn(state.roles, header);
    th.className = 'sortable';
    th.dataset.header = header;
    if (state.hiddenHeaders.has(header)) th.classList.add('hidden');
    if (role) th.dataset.role = role;
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
    if (state.manualRows.has(row)) tr.dataset.manual = 'true';
    if (state.selected.has(id)) tr.dataset.selected = 'true';

    const selectTd = document.createElement('td');
    const selectInput = document.createElement('input');
    selectInput.type = 'checkbox';
    selectInput.className = 'row-select';
    selectInput.dataset.rowId = id;
    selectInput.checked = state.selected.has(id);
    selectInput.addEventListener('change', () => {
      if (selectInput.checked) state.selected.add(id);
      else state.selected.delete(id);
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
    if (state.detailsId === id) tr.dataset.details = 'true';
    // A click on a line, away from its controls, selects it for the
    // details panel (FR-16).
    tr.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.row-select, .row-details, .colour-chip')) return;
      if (state.detailsId !== id) openDetails(id);
    });
    // Moving through the cells by keyboard keeps an open panel on the line.
    tr.addEventListener('focusin', (e) => {
      if (state.detailsId !== null && state.detailsId !== id && (e.target as HTMLElement).classList.contains('cell-input')) openDetails(id);
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
      if (header === state.roles.name) td.classList.add('primary-label');
      if (state.hiddenHeaders.has(header)) td.classList.add('hidden');
      tr.appendChild(td);
    });

    const colourTd = document.createElement('td');
    const chip = document.createElement('span');
    chip.className = `colour-chip ${row.colour}`;
    chip.title = row.colour;
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
    if (section.area !== null) body.appendChild(sectionRow(section, columns.length + 3, t));
    if (!section.collapsed) section.rows.forEach(renderRow);
  }

  const allSelected = rows.length > 0 && rows.every(({ row }) => state.selected.has(rowId(row)));
  const selectAllInput = el<HTMLButtonElement>('select-all');
  selectAllInput.textContent = t.selectAll;
  el('delete-selected').textContent = t.deleteSelected;
  selectAllInput.dataset.allSelected = allSelected ? 'true' : 'false';

  renderMapItems();
  renderWorkStatus();

  // A collapsed section is still a shown section.
  el('empty-list').classList.toggle('hidden', sections.some((section) => section.rows.length > 0));
  el('counter-selected').textContent = `${t.selected}: ${state.selected.size}`;
  el('counter-retained').textContent = `${t.retained}: ${currentCounters().retained}`;
  el('counter-removed').textContent = `${t.removed}: ${currentCounters().removed}`;

  renderFilterColumnSelect();
  renderColumnVisibility();
  renderPresets();
  renderAreaPanel();
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
  const t = strings(state.prefs.lang);
  state.headers.forEach((header) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'column-visible';
    input.dataset.header = header;
    input.checked = !state.hiddenHeaders.has(header);
    input.addEventListener('change', () => {
      if (input.checked) state.hiddenHeaders.delete(header);
      else state.hiddenHeaders.add(header);
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
  if (state.rows.length !== before) markDirty();
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
      comments: commentsOf(state.comments, row).map((c) => ({ date: c.date, text: c.text })),
    })),
    background: bg ? { ...bg } : null,
    markers,
    excluded: [...state.excluded].filter((row) => retained.has(row)).map((row) => index.get(row)!).sort((a, b) => a - b),
    presets: state.presets.map(clonePreset),
    areaValues: [...state.areaValues],
    statuses: state.statuses.map((x) => ({ ...x })),
    symbolsFromStatus: state.symbolsFromStatus,
    segment: state.segment,
    viewport: { ...(mapView?.viewport ?? { scale: 1, x: 0, y: 0 }) },
    sort: { ...state.sort },
    filter: { ...state.filter },
  };
}

// The interactive export (FR-11, FR-39): the work state the presentation
// shows, without the rows removed from the list, the items switched off for
// the presentation, the presets, and the values as imported before edits;
// with the presentation numbers and the presentation view.
interface ExportSummary {
  items: number;
  columns: number;
  hidden: number;
  placed: number;
  comments: number;
  background: { width: number; height: number } | null;
  removed: number;
  excluded: number;
  edited: number;
  presets: number;
}

// The grouped numbers of the exported rows (indices into the ingested rows).
function labelsOf(indices: number[]): string[] {
  const labels = new Map(numbered().map((n) => [n.row, n.label]));
  return indices.map((i) => labels.get(state.ingested[i]) ?? '');
}

export function captureExport(): { data: Omit<ExportData, 'exportedAt'>; summary: ExportSummary } {
  const ws = captureWorkState();
  const numbersAll = rowNumbers(ws.rows);
  const shown = ws.rows.map((_, i) => i).filter((i) => !ws.rows[i].removed && !ws.excluded.includes(i));
  const newIndex = new Map(shown.map((old, i) => [old, i]));
  const rows = shown.map((i) => ({ ...ws.rows[i], edited: {} }));
  const workState: WorkState = {
    ...ws,
    rows,
    markers: ws.markers.filter((m) => newIndex.has(m.row)).map((m) => ({ ...m, row: newIndex.get(m.row)! })),
    excluded: [],
    presets: [],
    segment: 'presentation',
    viewport: { ...(presentationView?.viewport ?? ws.viewport) },
    sort: { header: null, direction: 'asc' },
    filter: { ...NO_FILTER },
  };
  const summary: ExportSummary = {
    items: rows.length,
    columns: ws.headers.length,
    hidden: ws.hiddenHeaders.length,
    placed: workState.markers.length,
    comments: rows.reduce((n, r) => n + r.comments.length, 0),
    background: ws.background ? { width: ws.background.width, height: ws.background.height } : null,
    removed: ws.rows.filter((r) => r.removed).length,
    excluded: ws.excluded.length,
    edited: ws.rows.filter((r) => !r.removed).reduce((n, r) => n + Object.keys(r.edited).length, 0),
    presets: ws.presets.length,
  };
  return {
    data: {
      application: __APP_VERSION__,
      lang: state.prefs.lang,
      theme: state.prefs.theme,
      workState,
      numbers: shown.map((i) => numbersAll[i]!),
      // In the grouped numbering, the numbers as shown (FR-17).
      ...(groupedNumbering() ? { labels: labelsOf(shown) } : {}),
    },
    summary,
  };
}

// The exported page: the application's own single-file page with the data
// island embedded (one pipeline, FR-11).
export function exportPage(now: Date = new Date()): string | null {
  const page = selfPage();
  if (page === null) return null;
  return embedDataIsland(page, serialiseExport(captureExport().data, now));
}

let exportMessage: 'done' | 'cancelled' | 'failed' | 'unavailable' | null = null;
// The page prepared when the dialog opened, so that the size stated is the
// size of the file that is written.
let preparedExport: string | null = null;

function formatSize(bytes: number): string {
  const locale = state.prefs.lang === 'sv' ? 'sv-SE' : 'en-GB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(mb)} MB`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.max(1, Math.round(bytes / 1024)))} kB`;
}

function openExportDialog(): void {
  if (state.viewOnly) return;
  preparedExport = exportPage();
  if (preparedExport === null) {
    exportMessage = 'unavailable';
    renderExport();
    return;
  }
  exportMessage = null;
  el('export-panel').classList.remove('hidden');
  renderExport();
  el('export-go').focus();
}

function closeExportDialog(): void {
  preparedExport = null;
  el('export-panel').classList.add('hidden');
  el('export-open').focus();
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? String(values[key]) : m));
}

function renderExport(): void {
  const t = strings(state.prefs.lang);
  const status = el('export-status');
  const messages = { done: t.exportDone, cancelled: t.exportCancelled, failed: t.exportFailed, unavailable: t.exportUnavailable };
  status.textContent = exportMessage ? messages[exportMessage] : '';
  status.classList.toggle('error', exportMessage === 'failed' || exportMessage === 'unavailable');
  if (el('export-panel').classList.contains('hidden') || preparedExport === null) return;
  const s = captureExport().summary;
  const item = (text: string) => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  };
  const items = fill(t.exportItems, { items: s.items, columns: s.columns });
  el('export-contains').replaceChildren(
    item(s.hidden > 0 ? `${items}, ${fill(t.exportHiddenColumns, { hidden: s.hidden })}` : items),
    item(fill(t.exportPlaced, { placed: s.placed })),
    item(fill(t.exportComments, { comments: s.comments })),
    item(s.background ? fill(t.exportBackground, s.background) : t.exportNoBackground),
    item(t.exportVocabularies),
    item(t.exportLanguageTheme),
  );
  el('export-omitted').replaceChildren(
    item(fill(t.exportRemoved, { removed: s.removed })),
    item(fill(t.exportExcluded, { excluded: s.excluded })),
    item(fill(t.exportEditedOriginals, { edited: s.edited })),
    item(t.exportPresets),
  );
  el('export-size').textContent = fill(t.exportSize, { size: formatSize(new Blob([preparedExport]).size) });
}

async function runExport(): Promise<void> {
  const page = preparedExport;
  if (page === null) return;
  const outcome = await writeFile(page, EXPORT_FILE);
  exportMessage = outcome === 'saved' ? 'done' : outcome;
  closeExportDialog();
  renderExport();
}

function hasWork(): boolean {
  return state.ingested.length > 0 || mapView?.background != null;
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
const EXPORT_FILE: FileKind = { name: SUGGESTED_EXPORT_NAME, mime: 'text/html', extension: '.html', description: 'MapVibes presentation' };

// Writes a file only on the user's explicit action: through the save dialog
// where the browser has one, otherwise as a download.
async function writeFile(text: string, kind: FileKind): Promise<WriteOutcome> {
  const blob = new Blob([text], { type: kind.mime });
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
      return 'saved';
    } catch (e) {
      return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'failed';
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
    return 'saved';
  } catch {
    return 'failed';
  }
}

type WorkMessage = 'saved' | 'save-failed' | 'opened' | 'open-failed' | 'compare-opened' | 'demo-loaded';
let workMessage: WorkMessage | null = null;
let workErrorText = '';

// Content changes mark the work as unsaved: the ingested rows, removals,
// colours, the background, and markers. View changes (segment, zoom and pan,
// list sorting, filtering, and column visibility) are saved with the work
// but do not by themselves count as unsaved changes.
function markDirty(): void {
  // Nothing in the exported viewer is work to save.
  if (state.viewOnly) return;
  state.dirty = true;
  if (workMessage === 'saved' || workMessage === 'opened' || workMessage === 'demo-loaded') workMessage = null;
  renderWorkStatus();
}

function renderWorkStatus(): void {
  const t = strings(state.prefs.lang);
  const status = el('work-status');
  const messages: Record<WorkMessage, string> = {
    saved: t.workSaved,
    'save-failed': t.workSaveFailed,
    opened: t.workOpened,
    'open-failed': workErrorText,
    'compare-opened': t.compareOpened,
    'demo-loaded': t.demoLoaded,
  };
  status.textContent = workMessage ? messages[workMessage] : '';
  status.classList.toggle('error', workMessage === 'save-failed' || workMessage === 'open-failed');
  el<HTMLButtonElement>('work-save').disabled = !hasWork();
  el('work-dirty').textContent = t.workUnsaved;
  el('work-dirty').classList.toggle('hidden', !state.dirty);
  document.documentElement.dataset.unsaved = state.dirty ? 'true' : 'false';
  // The demo's work is labelled as example data while it is loaded.
  el('demo-badge').textContent = t.demoBadge;
  el('demo-badge').classList.toggle('hidden', !demoLoaded);
  document.documentElement.dataset.demo = demoLoaded ? 'true' : 'false';
}

export async function saveWork(): Promise<WriteOutcome> {
  if (state.viewOnly) return 'cancelled';
  const text = serialiseWorkState(captureWorkState(), new Date());
  const outcome = await writeFile(text, WORK_STATE_FILE);
  if (outcome === 'saved') state.dirty = false;
  if (outcome !== 'cancelled') workMessage = outcome === 'saved' ? 'saved' : 'save-failed';
  renderWorkStatus();
  return outcome;
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
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
    if (e.code === 'unknown-version') return t.workOpenUnknownVersion.replace('{version}', e.detail);
    if (e.code === 'invalid' && e.problem) return `${t.workOpenInvalid} ${problemText(e.problem)}.`;
    return t.workOpenNotWorkState;
  }
  return t.workOpenUnreadable;
}

function reportOpenFailure(text: string): void {
  workMessage = 'open-failed';
  workErrorText = text;
  renderWorkStatus();
}

// Restores a complete work state. The background is decoded first; if that
// fails, nothing else is changed.
async function applyWorkState(ws: WorkState): Promise<boolean> {
  if (!mapView) return false;
  await closePdf();
  showMapError(null);
  if (ws.background) {
    const ok = await mapView.setBackgroundSource(ws.background.src, ws.viewport);
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
  presetMessage = null;
  state.headers = [...ws.headers];
  state.visibleHeaders = [...ws.headers];
  state.hiddenHeaders = new Set(ws.hiddenHeaders);
  state.ingested = ws.rows.map((r) => ({ values: { ...r.values }, colour: r.colour }));
  state.rows = state.ingested.filter((_, i) => !ws.rows[i].removed);
  state.manualRows = new Set(state.ingested.filter((_, i) => ws.rows[i].manual));
  demoLoaded = false;
  state.edited = new Map(state.ingested.flatMap((row, i) => (Object.keys(ws.rows[i].edited).length > 0 ? [[row, { ...ws.rows[i].edited }]] : [])));
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
  state.statuses = ws.statuses.map((x) => ({ ...x }));
  state.symbolsFromStatus = ws.symbolsFromStatus;
  // Presets in the file are merged into the saved presets; a preset in the
  // file replaces a saved preset of the same name (FR-23).
  if (ws.presets.length > 0) {
    for (const preset of ws.presets) state.presets = upsertPreset(state.presets, preset);
    storePresets(state.presets);
  }
  state.sort = { ...ws.sort };
  state.filter = { ...ws.filter };

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
  if (state.viewOnly) return false;
  let text: string;
  try {
    text = await readText(file);
  } catch {
    reportOpenFailure(strings(state.prefs.lang).workOpenUnreadable);
    return false;
  }
  // An exported file (FR-14) is opened for comparison; it never replaces
  // the current work.
  if (isHtmlFile(file, text)) return openExportForComparison(text);
  let ws: WorkState;
  try {
    ws = parseWorkState(text);
  } catch (e) {
    reportOpenFailure(openErrorText(e));
    return false;
  }
  if (state.dirty && !window.confirm(strings(state.prefs.lang).workConfirmReplace)) return false;
  const ok = await applyWorkState(ws);
  if (!ok) reportOpenFailure(strings(state.prefs.lang).workOpenBackgroundFailed);
  return ok;
}

// Re-import and comparison (FR-14): an exported file is read and its items
// are paired with the current items by the identifier column, for display
// only. Marker positions from the file are adopted for paired items only
// through the explicit action, as unsaved changes.
interface OpenComparison {
  data: ExportData;
  // Current row identifiers chosen for adoption.
  selected: Set<string>;
  message: { count: number } | null;
}

let comparison: OpenComparison | null = null;

function isHtmlFile(file: File, text: string): boolean {
  return /\.html?$/i.test(file.name) || file.type === 'text/html' || /^\s*</.test(text);
}

function openExportForComparison(text: string): boolean {
  const t = strings(state.prefs.lang);
  const island = readDataIsland(new DOMParser().parseFromString(text, 'text/html'));
  if (island === null) {
    reportOpenFailure(t.compareNoData);
    return false;
  }
  let data: ExportData;
  try {
    data = parseExport(island);
  } catch (e) {
    if (!(e instanceof ExportError)) throw e;
    if (e.code === 'unknown-version') reportOpenFailure(fill(t.compareUnknownVersion, { version: e.detail }));
    else if (e.code === 'not-export') reportOpenFailure(t.compareNoData);
    else reportOpenFailure(t.compareDamaged);
    return false;
  }
  comparison = { data, selected: new Set(), message: null };
  workMessage = 'compare-opened';
  renderWorkStatus();
  renderComparison();
  el('compare-heading').scrollIntoView?.({ block: 'nearest' });
  return true;
}

function closeComparison(): void {
  comparison = null;
  renderComparison();
}

// The items of both sides, for pairing.
function comparisonSides(data: ExportData): { current: CompareItem[]; file: CompareItem[] } | null {
  const currentKey = state.roles.identifier;
  const fileKey = data.workState.roles.identifier;
  if (currentKey === undefined || fileKey === undefined) return null;
  const current = numbered().map(({ row, label: number }) => ({
    key: rowId(row),
    identifier: row.values[currentKey] ?? '',
    number,
    label: itemLabel(row, number),
    position: state.positions.get(row) ?? null,
  }));
  const placed = new Map(data.workState.markers.map((m) => [m.row, m.position]));
  const t = strings(state.prefs.lang);
  const file = data.workState.rows.map((row, i) => ({
    key: String(i),
    identifier: row.values[fileKey] ?? '',
    number: data.labels?.[i] ?? String(data.numbers[i]),
    label: displayName(row.values, data.workState.roles, `${t.numberColumn} ${data.labels?.[i] ?? data.numbers[i]}`),
    position: placed.get(i) ?? null,
  }));
  return { current, file };
}

function fileColumnLabel(data: ExportData, key: string | undefined): string {
  if (key === undefined) return '';
  const manual = data.workState.manualColumns.find((c) => c.key === key);
  return manual ? manual.label : columnLabel(key, strings(state.prefs.lang).untitledHeader);
}

function currentComparison(): Comparison | null {
  if (!comparison) return null;
  const sides = comparisonSides(comparison.data);
  return sides ? compareItems(sides.current, sides.file) : null;
}

function renderComparison(): void {
  const panel = el('compare-panel');
  if (!comparison) {
    panel.classList.add('hidden');
    return;
  }
  const t = strings(state.prefs.lang);
  const data = comparison.data;
  panel.classList.remove('hidden');
  el('compare-heading').textContent = t.compareHeading;
  el('compare-close').textContent = t.compareClose;
  el('compare-select-all').textContent = t.compareSelectAll;
  el('compare-adopt').textContent = t.compareAdopt;
  el('compare-source').textContent = fill(t.compareSource, {
    date: formatCommentDate(data.exportedAt),
    version: `v${data.application}`,
    items: data.workState.rows.length,
    fileColumn: fileColumnLabel(data, data.workState.roles.identifier) || '–',
    currentColumn: state.roles.identifier !== undefined ? labelOf(state.roles.identifier) : '–',
  });
  const result = currentComparison();
  const warning = el('compare-warning');
  const groups = el('compare-groups');
  groups.replaceChildren();
  let warningText = '';
  if (state.roles.identifier === undefined) warningText = t.compareNoIdentifierCurrent;
  else if (data.workState.roles.identifier === undefined) warningText = t.compareNoIdentifierFile;
  else if (!mapView?.background) warningText = t.compareNoBackground;
  else if (data.workState.background && (data.workState.background.width !== mapView.background.width || data.workState.background.height !== mapView.background.height)) {
    warningText = fill(t.compareBackgroundDiffers, {
      fileWidth: data.workState.background.width,
      fileHeight: data.workState.background.height,
      width: mapView.background.width,
      height: mapView.background.height,
    });
  }
  warning.textContent = warningText;
  warning.classList.toggle('hidden', warningText === '');
  const canAdopt = result !== null && mapView?.background != null;
  // Drop choices that are no longer adoptable.
  const adoptable = new Set((result?.matchedWithMarkers ?? []).map((m) => m.current.key));
  for (const key of [...comparison.selected]) if (!adoptable.has(key)) comparison.selected.delete(key);
  if (result) {
    const entry = (item: CompareItem, notes: string[] = []) => {
      const li = document.createElement('li');
      li.className = 'compare-entry';
      li.dataset.key = item.key;
      const name = document.createElement('span');
      name.className = 'compare-name';
      name.textContent = `${item.number}. ${item.label}`;
      li.appendChild(name);
      for (const note of notes) {
        const n = document.createElement('span');
        n.className = 'compare-note';
        n.textContent = note;
        li.appendChild(n);
      }
      return li;
    };
    const group = (kind: string, title: string, items: HTMLElement[]) => {
      const section = document.createElement('section');
      section.className = 'compare-group';
      section.dataset.group = kind;
      const h = document.createElement('h3');
      h.textContent = fill(title, { count: items.length });
      const list = document.createElement('ul');
      list.append(...items);
      if (items.length === 0) {
        const none = document.createElement('li');
        none.className = 'notice compare-none';
        none.textContent = t.compareEmpty;
        list.appendChild(none);
      }
      section.append(h, list);
      groups.appendChild(section);
    };
    group(
      'matched-markers',
      t.compareMatchedMarkers,
      result.matchedWithMarkers.map((m) => {
        const li = entry(m.current, [m.current.position ? (m.positionDiffers ? t.compareDiffers : t.compareSamePosition) : t.compareNoCurrentMarker]);
        li.dataset.fileKey = m.file.key;
        if (m.positionDiffers) {
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.className = 'compare-select';
          box.disabled = !canAdopt;
          box.checked = comparison!.selected.has(m.current.key);
          box.setAttribute('aria-label', fill(t.compareSelectItem, { label: m.current.label }));
          box.addEventListener('change', () => {
            if (box.checked) comparison!.selected.add(m.current.key);
            else comparison!.selected.delete(m.current.key);
            comparison!.message = null;
            renderComparison();
          });
          li.prepend(box);
        }
        return li;
      }),
    );
    group(
      'matched-no-markers',
      t.compareMatchedNoMarkers,
      result.matchedWithoutMarkers.map((m) => entry(m.current, m.current.position ? [t.compareHasCurrentMarker] : [])),
    );
    group('file-only', t.compareFileOnly, result.fileOnly.map((item) => entry(item)));
    group('current-only', t.compareCurrentOnly, result.currentOnly.map((item) => entry(item)));
    group('unpairable', t.compareUnpairable, [
      ...result.unpairable.current.map((item) => entry(item, [t.compareInCurrent])),
      ...result.unpairable.file.map((item) => entry(item, [t.compareInFile])),
    ]);
  }
  const differing = (result?.matchedWithMarkers ?? []).filter((m) => m.positionDiffers);
  el<HTMLButtonElement>('compare-select-all').disabled = !canAdopt || differing.length === 0;
  el<HTMLButtonElement>('compare-adopt').disabled = !canAdopt || comparison.selected.size === 0;
  el('compare-status').textContent = comparison.message ? fill(t.compareAdopted, { count: comparison.message.count }) : '';
}

function selectAllDiffering(): void {
  const result = currentComparison();
  if (!comparison || !result) return;
  for (const m of result.matchedWithMarkers) if (m.positionDiffers) comparison.selected.add(m.current.key);
  comparison.message = null;
  renderComparison();
}

// The explicit adoption: the chosen paired items take the marker positions
// of the file. It is an unsaved change, like any placement.
function adoptPositions(): void {
  const result = currentComparison();
  if (!comparison || !result || !mapView?.background) return;
  let count = 0;
  for (const m of result.matchedWithMarkers) {
    if (!comparison.selected.has(m.current.key) || !m.file.position) continue;
    const row = rowById(m.current.key);
    if (!row) continue;
    placeMarker(state.positions, row, { ...m.file.position });
    count += 1;
  }
  comparison.selected.clear();
  comparison.message = { count };
  if (count > 0) markDirty();
  renderMapItems();
  renderComparison();
}

export function setSegment(segment: Segment): void {
  state.segment = segment;
  showSegment(document, segment);
  if (segment === 'map') mapView?.shown();
  if (segment === 'presentation') presentationView?.shown();
  // Panels depend on the stage size, which is known only while it is shown.
  renderMapItems();
  renderDetailsPanel();
}

let mapView: MapView | null = null;

export function getMapView(): MapView | null {
  return mapView;
}

type MapError =
  | 'unsupported'
  | 'unreadable'
  | 'needs-background'
  | 'pdf-unreadable'
  | 'pdf-render'
  | 'osm-malformed'
  | 'osm-empty'
  | 'osm-too-large'
  | 'osm-render';

function showMapError(kind: MapError | null): void {
  const t = strings(state.prefs.lang);
  const messages: Record<MapError, string> = {
    unsupported: t.mapUnsupported,
    unreadable: t.mapUnreadable,
    'needs-background': t.markerNeedsBackground,
    'pdf-unreadable': t.pdfUnreadable,
    'pdf-render': t.pdfRenderFailed,
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

function applyPreset(preset: ColumnPreset, kind: 'auto' | 'applied'): void {
  const config = presetConfiguration(preset, state.headers);
  state.hiddenHeaders = new Set(config.hidden);
  state.roles = config.roles;
  if (preset.areas) state.areaValues = [...preset.areas];
  if (preset.statuses) state.statuses = preset.statuses.map((s) => ({ ...s }));
  state.activePreset = preset.name;
  presetMessage = { kind, name: preset.name };
}

function applySelectedPreset(): void {
  const preset = state.presets.find((p) => p.name === el<HTMLSelectElement>('preset-select').value);
  if (!preset) return;
  applyPreset(preset, 'applied');
  markDirty();
  renderList();
}

function saveCurrentPreset(): void {
  const t = strings(state.prefs.lang);
  const input = el<HTMLInputElement>('preset-name');
  const name = input.value.trim();
  if (name === '' || state.headers.length === 0) return;
  if (state.presets.some((p) => p.name === name) && !window.confirm(t.presetConfirmReplace.replace('{name}', name))) return;
  state.presets = upsertPreset(state.presets, {
    name,
    headers: [...state.headers],
    hidden: state.headers.filter((h) => state.hiddenHeaders.has(h)),
    roles: { ...state.roles },
    areas: [...state.areaValues],
    statuses: state.statuses.map((s) => ({ ...s })),
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
  if (!state.presets.some((p) => p.name === name)) return;
  if (!window.confirm(t.presetConfirmRemove.replace('{name}', name))) return;
  state.presets = removePreset(state.presets, name);
  storePresets(state.presets);
  if (state.activePreset === name) state.activePreset = null;
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
  if (state.manualRows.has(row) || state.manualColumns.has(key)) return;
  const record = { ...(state.edited.get(row) ?? {}) };
  const imported = key in record ? record[key] : (row.values[key] ?? '');
  if (value === imported) delete record[key];
  else record[key] = imported;
  if (Object.keys(record).length === 0) state.edited.delete(row);
  else state.edited.set(row, record);
}

// Marks a control whose imported value was edited by hand.
function markEdited(control: HTMLElement, row: RowData, key: string, t: Strings): void {
  const record = state.edited.get(row);
  if (!record || !(key in record)) return;
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
  if (key === state.roles.area) {
    input.setAttribute('list', 'area-values');
    input.classList.add('combobox');
    const value = (row.values[key] ?? '').trim();
    if (value !== '' && !hasValue(state.areaValues, value)) {
      input.classList.add('not-in-vocabulary');
      input.title = t.vocabNotInList;
    }
  }
  markEdited(input, row, key, t);
  return input;
}

// A cell of the status column (FR-33): chosen from the status list. A value
// that is not in the list is kept and shown as such until another is chosen.
function statusCell(row: RowData, key: string, number: string): HTMLSelectElement {
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
  if (state.shapes.has(row)) return 'manual';
  return statusSymbolOf(row) !== null ? 'status' : 'default';
}

function statusSymbolOf(row: RowData): MarkerSymbol | null {
  const key = state.roles.status;
  if (!state.symbolsFromStatus || key === undefined) return null;
  const symbol = statusSymbol(state.statuses, row.values[key] ?? '');
  return symbol !== null && isSymbol(symbol) ? symbol : null;
}

function symbolOf(row: RowData): MarkerSymbol {
  return state.shapes.get(row) ?? statusSymbolOf(row) ?? DEFAULT_SHAPE;
}

function effectiveSymbols(): Map<RowData, MarkerSymbol> {
  return new Map(state.rows.map((row) => [row, symbolOf(row)]));
}

function setSymbolsFromStatus(on: boolean): void {
  state.symbolsFromStatus = on;
  markDirty();
  renderList();
}

function renderLegends(): void {
  const t = strings(state.prefs.lang);
  const groups = shownAreaGroups();
  renderLegend(el('map-legend'), t, state.statuses, groups);
  renderLegend(el('presentation-legend'), t, state.statuses, groups);
}

// The groups behind the grouped numbers shown (FR-17), read from the labels
// themselves, so that the exported viewer shows them as well.
function shownAreaGroups(): LegendAreaGroup[] {
  const areaKey = state.roles.area;
  if (areaKey === undefined) return [];
  const groups = new Map<number, string>();
  for (const { row, label } of numbered()) {
    const match = /^(\d+)\.\d+$/.exec(label);
    if (match && !groups.has(Number(match[1]))) groups.set(Number(match[1]), (row.values[areaKey] ?? '').trim());
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([index, area]) => ({ index, area }));
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
  const needsArea = (state.numbering === 'grouped' || state.listView === 'grouped') && state.roles.area === undefined;
  const message = state.numbering === 'grouped' && state.listView === 'grouped' ? t.groupingNeedsArea : state.numbering === 'grouped' ? t.numberingNeedsArea : t.listViewNeedsArea;
  el('numbering-notice').textContent = needsArea ? message : '';
  el('numbering-notice').classList.toggle('hidden', !needsArea);
  const groups = groupedNumbering() ? shownAreaGroups() : [];
  el('numbering-groups').textContent =
    groups.length > 0 ? `${t.numberingGroups} ${groups.map((g) => `${g.index}. ${g.area === '' ? t.numberingNoArea : g.area}`).join(' · ')}` : '';
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
    for (const row of state.ingested) if ((row.values[key] ?? '').trim() === from) row.values[key] = result.name;
  }
  setStatuses(result.statuses);
}

function symbolSelect(value: string, label: string, onChange: (symbol: string) => void): HTMLSelectElement {
  const t = strings(state.prefs.lang);
  const select = document.createElement('select');
  select.className = 'status-symbol';
  select.setAttribute('aria-label', label);
  for (const symbol of SYMBOLS) {
    const opt = document.createElement('option');
    opt.value = symbol;
    opt.textContent = shapeName(t, symbol);
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
let areaMessage = '';

function setAreaValues(next: string[], message = ''): void {
  state.areaValues = next;
  areaMessage = message;
  markDirty();
  renderList();
}

function renameAreaValue(from: string, to: string): void {
  const { list, renamed } = renameValue(state.areaValues, from, to);
  if (!renamed) {
    renderList();
    return;
  }
  // Cells holding the old value follow the rename.
  const key = state.roles.area;
  if (key !== undefined) {
    for (const row of state.ingested) if ((row.values[key] ?? '').trim() === from) row.values[key] = list[state.areaValues.indexOf(from)];
  }
  setAreaValues(list);
}

function collectAreaValues(): void {
  const t = strings(state.prefs.lang);
  const key = state.roles.area;
  if (key === undefined) return;
  const before = state.areaValues.length;
  const next = mergeValues(state.areaValues, collectValues(state.rows, key));
  setAreaValues(next, t.vocabCollected.replace('{count}', String(next.length - before)));
}

function renderAreaPanel(): void {
  const t = strings(state.prefs.lang);
  const list = el('area-list');
  list.innerHTML = '';
  for (const value of state.areaValues) {
    const li = document.createElement('li');
    li.className = 'vocab-item';
    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'vocab-name';
    name.value = value;
    name.setAttribute('aria-label', `${t.vocabRename}: ${value}`);
    name.addEventListener('change', () => renameAreaValue(value, name.value));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'vocab-remove';
    remove.textContent = t.vocabRemove;
    remove.setAttribute('aria-label', `${t.vocabRemove}: ${value}`);
    remove.addEventListener('click', () => setAreaValues(removeValue(state.areaValues, value)));
    li.append(name, remove);
    list.appendChild(li);
  }
  const datalist = el('area-values');
  datalist.innerHTML = '';
  for (const value of state.areaValues) {
    const opt = document.createElement('option');
    opt.value = value;
    datalist.appendChild(opt);
  }
  el<HTMLButtonElement>('area-collect').disabled = state.roles.area === undefined;
  el('area-status').textContent = state.areaValues.length === 0 && !areaMessage ? t.vocabEmpty : areaMessage;
}

function setColumnRole(header: string, role: Role | null): void {
  state.roles = assignRole(state.roles, header, role);
  markDirty();
  renderList();
}

// The display name of an item (FR-1): name/title, else identifier, else the
// item's number.
function itemLabel(row: RowData, number: string): string {
  return displayName(row.values, state.roles, `${strings(state.prefs.lang).numberColumn} ${number}`);
}

function markerLabel(marker: PlacedMarker): string {
  return `${strings(state.prefs.lang).markerLabel} ${marker.label}: ${itemLabel(marker.row, marker.label)}`;
}

function selectMarker(id: string | null): void {
  state.selectedMarker = id;
  renderMapItems();
  // Selecting a marker opens its details; the panel follows the selection.
  if (id !== null) openDetails(id);
}

// Details panel (FR-7): the complete data of one item, open in the
// Information and Map segments, following the selection and the live data.
let detailsReturnFocus: HTMLElement | null = null;

function openDetails(id: string | null, focus = false): void {
  const previous = state.detailsId;
  state.detailsId = id;
  if (id !== null && focus) detailsReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  renderDetailsPanel();
  document.querySelectorAll<HTMLElement>('#row-table-body tr[data-row-id]').forEach((tr) => {
    if (tr.dataset.rowId === state.detailsId) tr.dataset.details = 'true';
    else delete tr.dataset.details;
  });
  if (id !== null && focus) document.querySelector<HTMLElement>('#details-panel .details-close')?.focus();
  if (id === null && previous !== null) {
    const target = detailsReturnFocus;
    detailsReturnFocus = null;
    if (target?.isConnected) target.focus();
  }
}

function detailLabels(t: Strings): DetailLabels {
  return {
    number: t.detailsNumber,
    colour: t.colour,
    symbol: t.detailsSymbol,
    comments: t.detailsComments,
    noComments: t.detailsNoComments,
    close: t.close,
    empty: t.detailsEmpty,
    removeComment: t.commentRemove,
  };
}

// Every column, hidden ones included, in the list's column order.
function detailModel(row: RowData, t: Strings): DetailModel {
  const number = numberLabel(row);
  const symbol = symbolOf(row);
  const fields: DetailField[] = listColumnOrder(state.headers, state.roles).map((key) => ({
    key,
    label: labelOf(key),
    value: row.values[key] ?? '',
    kind: key === state.roles.status ? 'status' : key === state.roles.area ? 'area' : 'text',
  }));
  return {
    rowId: rowId(row),
    number,
    name: itemLabel(row, number),
    colour: row.colour,
    colourName: colourName(t, row.colour),
    symbol,
    symbolName: shapeName(t, symbol),
    fields,
    comments: commentsOf(state.comments, row).map((c) => ({ id: c.id, date: c.date, dateText: formatCommentDate(c.date), text: c.text })),
  };
}

function renderDetailsPanel(): void {
  const panel = el('details-panel');
  const row = state.detailsId ? rowById(state.detailsId) : undefined;
  if (!row) {
    // The item was removed, or nothing is selected: the panel closes.
    state.detailsId = null;
    panel.classList.add('hidden');
    panel.replaceChildren();
    delete panel.dataset.rowId;
    setDetailsLayout(false);
    return;
  }
  const t = strings(state.prefs.lang);
  const sameRow = panel.dataset.rowId === state.detailsId;
  // An unsent comment survives re-rendering for the same item.
  const draft = sameRow ? (panel.querySelector<HTMLTextAreaElement>('.details-comment-input')?.value ?? '') : '';
  const model = detailModel(row, t);
  // What decides the panel's controls: when only values change for the same
  // item, the panel is updated in place, so that focus and keyboard
  // navigation are not disturbed by an edit.
  const structure = JSON.stringify([
    state.prefs.lang,
    model.fields.map((f) => [f.key, f.kind]),
    model.comments.map((c) => c.id),
    state.statuses,
  ]);
  const target = sameRow && panel.dataset.structure === structure ? document.createElement('div') : panel;
  if (target !== panel) target.id = panel.id;
  renderDetails(target, model, detailLabels(t), {
    close: () => openDetails(null),
    edit: {
      renderField: (field) => (field.kind === 'status' ? statusCell(row, field.key, model.number) : valueInput(row, field.key, model.number)),
      removeComment: (id) => {
        if (!removeComment(state.comments, row, id)) return;
        markDirty();
        renderDetailsPanel();
        panel.querySelector<HTMLElement>('.details-comment-input')?.focus();
      },
      commentForm: () => commentForm(row, t, draft),
    },
  });
  if (target !== panel) patchDetails(panel, target);
  panel.dataset.structure = structure;
  panel.classList.toggle('hidden', state.segment === 'presentation');
  setDetailsLayout(true);
}

// Brings an open panel up to date from a fresh rendering of the same item
// with the same controls: the texts are replaced, and every control takes
// the fresh value and marks, the focused one keeping its node (and so its
// focus, selection, and place in the tab order).
function patchDetails(panel: HTMLElement, fresh: HTMLElement): void {
  const swap = (selector: string) => {
    const now = panel.querySelector(selector);
    const next = fresh.querySelector(selector);
    if (now && next) now.replaceWith(next);
  };
  swap('.details-badge');
  swap('.details-title');
  swap('.details-facts');
  swap('.details-comment-list');
  const nextValues = [...fresh.querySelectorAll<HTMLElement>('.details-fields dd')];
  panel.querySelectorAll<HTMLElement>('.details-fields dd').forEach((dd, i) => {
    const next = nextValues[i];
    if (!next) return;
    const control = dd.querySelector<HTMLInputElement | HTMLSelectElement>('.cell-input');
    const replacement = next.querySelector<HTMLInputElement | HTMLSelectElement>('.cell-input');
    if (control && replacement && control === document.activeElement) {
      control.className = replacement.className;
      control.title = replacement.title;
      if (replacement.dataset.edited) control.dataset.edited = replacement.dataset.edited;
      else delete control.dataset.edited;
      if (control.value !== replacement.value) control.value = replacement.value;
    } else {
      dd.replaceChildren(...next.childNodes);
    }
  });
}

// Appending a comment (FR-15): plain text; Ctrl+Enter or the button adds it.
function commentForm(row: RowData, t: Strings, draft: string): HTMLElement {
  const form = document.createElement('div');
  form.className = 'details-comment-form';
  const input = document.createElement('textarea');
  input.className = 'details-comment-input';
  input.rows = 3;
  input.value = draft;
  input.setAttribute('aria-label', t.commentNew);
  input.placeholder = t.commentNew;
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'details-comment-add';
  add.textContent = t.commentAdd;
  const submit = () => {
    if (!addComment(state.comments, row, input.value)) return;
    input.value = '';
    markDirty();
    renderDetailsPanel();
    el('details-panel').querySelector<HTMLElement>('.details-comment-input')?.focus();
  };
  add.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  });
  form.append(input, add);
  return form;
}

// While the panel is open, wide layouts make room for it beside the segment
// instead of covering it.
function setDetailsLayout(open: boolean): void {
  const value = open ? 'open' : 'closed';
  if (document.documentElement.dataset.details === value) return;
  document.documentElement.dataset.details = value;
  // The stages change size: the at-a-glance panels follow.
  if (state.segment !== 'information') renderMapItems();
}

function moveMarker(id: string, position: Point): void {
  const row = rowById(id);
  if (!row) return;
  placeMarker(state.positions, row, position);
  markDirty();
  renderMapItems();
}

function deleteMarker(id: string): void {
  const row = rowById(id);
  if (row && removeMarker(state.positions, row)) markDirty();
  if (state.selectedMarker === id) state.selectedMarker = null;
  renderMapItems();
}

function dropRowOnMap(id: string, clientX: number, clientY: number): void {
  const row = rowById(id);
  if (!row || !mapView) return;
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
    if (state.selectedMarker === id) li.dataset.selected = 'true';
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
    li.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData(ROW_DRAG_TYPE, id);
      e.dataTransfer?.setData('text/plain', itemLabel(row, number));
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copyMove';
    });
    li.addEventListener('click', () => {
      if (state.positions.has(row)) selectMarker(id);
      else openDetails(id);
    });
    list.appendChild(li);
  });
  el('placement-empty').classList.toggle('hidden', state.rows.length > 0);
  el('placement-hint').classList.toggle('hidden', state.rows.length === 0);
}

// Re-renders everything on the map that derives from the list: markers follow
// row deletions, colours, and the regenerated global numbering (FR-3).
function renderMapItems(): void {
  pruneMarkers(state.positions, state.rows);
  if (state.selectedMarker) {
    const row = rowById(state.selectedMarker);
    if (!row || !state.positions.has(row)) state.selectedMarker = null;
  }
  for (const row of [...state.excluded]) if (!state.rows.includes(row)) state.excluded.delete(row);
  for (const row of [...state.shapes.keys()]) if (!state.rows.includes(row)) state.shapes.delete(row);
  const markers = placedMarkers(state.rows, state.positions, effectiveSymbols(), numbered());
  markerLayer?.render(markers, state.selectedMarker);
  renderGlance('map', mapView, state.selectedMarker, (id) => selectMarker(id));
  renderPresentation();
  applyHighlight();
  renderPlacementList();
  const t = strings(state.prefs.lang);
  const selected = markers.find((m) => rowId(m.row) === state.selectedMarker);
  el('marker-selection').textContent = selected ? `${t.markerSelected}: ${selected.label}` : t.markerNoSelection;
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
  for (const opt of shapeSelect.options) opt.textContent = shapeName(t, opt.value as MarkerSymbol);
  shapeSelect.value = selected?.shape ?? 'circle';
}

// Presentation stage (FR-27): the same background on its own viewport, with
// the markers of the items that are switched on. Nothing is edited here.
let presentationView: MapView | null = null;
let presentationLayer: MarkerLayer | null = null;

function syncPresentationBackground(): void {
  if (!presentationView || !mapView) return;
  const bg = mapView.background;
  if (!bg) {
    if (presentationView.background) presentationView.clearBackground({ scale: 1, x: 0, y: 0 });
  } else if (presentationView.background?.src !== bg.src) {
    void presentationView.setBackgroundSource(bg.src);
  }
}

function setExcluded(row: RowData, excluded: boolean): void {
  if (excluded) state.excluded.add(row);
  else state.excluded.delete(row);
  markDirty();
  renderMapItems();
}

// The list beside the presentation stage, in two modes: in the application,
// a visibility toggle per placed item (FR-27); in the exported viewer
// (FR-38), the exported items, each opening its data card.
function renderVisibilityList(): void {
  const t = strings(state.prefs.lang);
  const list = el('visibility-list');
  list.innerHTML = '';
  const entries = state.viewOnly
    ? numbered().map(({ row, number, label }) => ({ row, number, label, colour: row.colour, shape: symbolOf(row) }))
    : placedMarkers(state.rows, state.positions, effectiveSymbols(), numbered());
  for (const entry of entries) {
    const id = rowId(entry.row);
    const shown = !state.excluded.has(entry.row);
    const li = document.createElement('li');
    li.className = 'visibility-item';
    li.dataset.rowId = id;
    li.dataset.shown = shown ? 'true' : 'false';
    if (state.presentationSelected === id) li.dataset.selected = 'true';
    const name = itemLabel(entry.row, entry.label);
    const badge = document.createElement('span');
    badge.className = `marker-badge marker-${entry.colour} ${symbolClasses(entry.shape)}`;
    drawSymbol(badge, entry.shape, entry.label);
    const text = document.createElement('span');
    text.className = 'placement-label';
    text.textContent = name;
    if (state.viewOnly) {
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'visibility-control item-open';
      open.dataset.rowId = id;
      open.append(badge, text);
      if (!state.positions.has(entry.row)) {
        const note = document.createElement('span');
        note.className = 'placement-status';
        note.textContent = t.viewerNotPlaced;
        open.appendChild(note);
      }
      open.addEventListener('click', () => openCard(id));
      li.appendChild(open);
    } else {
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
    }
    list.appendChild(li);
  }
  el('visibility-heading').textContent = state.viewOnly ? t.viewerItems : t.visibilityHeading;
  el('visibility-hint').textContent = state.viewOnly ? t.viewerItemsHint : t.visibilityHint;
  el('visibility-empty').classList.toggle('hidden', entries.length > 0);
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
  document.querySelectorAll<HTMLElement>('.marker[data-row-id], .glance-entry[data-row-id]').forEach((node) => {
    node.classList.toggle('highlighted', hoverId !== null && node.dataset.rowId === hoverId);
  });
}

function renderGlance(prefix: 'map' | 'presentation', view: MapView | null, selectedId: string | null, onSelect: (id: string) => void): void {
  const t = strings(state.prefs.lang);
  const list = el(`${prefix}-glance-list`);
  list.innerHTML = '';
  const candidates = placedMarkers(state.rows, state.positions, effectiveSymbols(), numbered()).filter((m) => !state.excluded.has(m.row));
  const inView = view?.background ? markersInView(candidates, view.viewport, view.stageSize()) : [];
  const areaKey = state.roles.area;
  for (const marker of inView) {
    const id = rowId(marker.row);
    const li = document.createElement('li');
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.className = 'glance-entry';
    entry.dataset.rowId = id;
    if (selectedId === id) entry.dataset.selected = 'true';
    const badge = document.createElement('span');
    badge.className = `marker-badge marker-${marker.colour} ${symbolClasses(marker.shape)}`;
    drawSymbol(badge, marker.shape, marker.label);
    const text = document.createElement('span');
    text.className = 'glance-text';
    const name = document.createElement('span');
    name.className = 'glance-name';
    name.textContent = itemLabel(marker.row, marker.label);
    text.appendChild(name);
    const area = areaKey === undefined ? '' : (marker.row.values[areaKey] ?? '').trim();
    if (area !== '') {
      const areaEl = document.createElement('span');
      areaEl.className = 'glance-area';
      areaEl.textContent = area;
      text.appendChild(areaEl);
    }
    entry.append(badge, text);
    entry.addEventListener('mouseenter', () => setHover(id));
    entry.addEventListener('mouseleave', () => setHover(null));
    entry.addEventListener('focus', () => setHover(id));
    entry.addEventListener('blur', () => setHover(null));
    entry.addEventListener('click', () => onSelect(id));
    li.appendChild(entry);
    list.appendChild(li);
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
  if (id !== null) el('presentation-card').querySelector<HTMLElement>('.details-close')?.focus({ preventScroll: true });
  else if (previous !== null && hadFocus) {
    // Focus returns to the marker the card belonged to.
    document.querySelector<HTMLElement>(`#presentation-marker-layer .marker[data-row-id="${previous}"]`)?.focus({ preventScroll: true });
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
  const placed = row && presentationView?.background ? state.positions.get(row) : undefined;
  // In the exported viewer, an item without a marker opens from the list.
  const position = placed ?? (row && state.viewOnly ? null : undefined);
  if (!row || position === undefined || state.excluded.has(row) || !presentationView) {
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
  const signature = JSON.stringify([state.prefs.lang, model]);
  if (signature !== cardSignature || card.dataset.rowId !== model.rowId || card.childElementCount === 0) {
    const refocus = card.contains(document.activeElement);
    cardSignature = signature;
    renderDetails(card, model, detailLabels(t), { close: closeCard });
    if (refocus) card.querySelector<HTMLElement>('.details-close')?.focus({ preventScroll: true });
  }
  // Beside the marker, on the side with more room, and within the stage; an
  // item without a marker opens in the stage's corner.
  const size = presentationView.stageSize();
  const screen = position ? imageToScreen(presentationView.viewport, position) : { x: 16 - CARD_GAP, y: 0 };
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
  const shown = placedMarkers(state.rows, state.positions, effectiveSymbols(), numbered()).filter((m) => !state.excluded.has(m.row));
  if (state.presentationSelected && !shown.some((m) => rowId(m.row) === state.presentationSelected)) {
    state.presentationSelected = null;
  }
  presentationLayer?.render(shown, state.presentationSelected);
  renderVisibilityList();
  renderGlance('presentation', presentationView, state.presentationSelected, (id) => openCard(id));
  renderCard();
  const has = presentationView?.background != null;
  for (const id of ['pres-zoom-in', 'pres-zoom-out', 'pres-fit', 'pres-reset']) {
    el<HTMLButtonElement>(id).disabled = !has;
  }
  el('pres-zoom-level').textContent = `${Math.round((presentationView?.viewport.scale ?? 1) * 100)}%`;
  el('presentation-empty').classList.toggle('hidden', has);
}

function initialisePresentation(): void {
  presentationView = new MapView(el('presentation-stage'), el('presentation-content'), el<HTMLImageElement>('presentation-image'), {
    onError: () => undefined,
    onBackgroundChanged: () => renderPresentation(),
    onViewportChanged: () => renderPresentation(),
  }, { panOverMarkers: true });
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
    if (e.key === 'Escape' && cardId !== null) closeCard();
  });
  el('pres-zoom-in').addEventListener('click', () => presentationView?.zoomBy(BUTTON_ZOOM_FACTOR));
  el('pres-zoom-out').addEventListener('click', () => presentationView?.zoomBy(1 / BUTTON_ZOOM_FACTOR));
  el('pres-fit').addEventListener('click', () => presentationView?.fit());
  el('pres-reset').addEventListener('click', () => presentationView?.reset());
  el('export-open').addEventListener('click', openExportDialog);
  el('export-cancel').addEventListener('click', closeExportDialog);
  el('export-go').addEventListener('click', () => void runExport());
  el('export-panel').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeExportDialog();
  });
  const stage = el('presentation-stage');
  stage.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.marker')) return;
    if (cardId !== null || state.presentationSelected !== null) closeCard();
  });
  // A stage, not an editor: nothing can be dropped here. Default handling is
  // prevented so that a dropped file is not opened by the browser either.
  stage.addEventListener('dragover', (e) => e.preventDefault());
  stage.addEventListener('drop', (e) => e.preventDefault());
}

function renderMapControls(): void {
  const view = mapView;
  const has = view?.background != null;
  for (const id of ['map-zoom-in', 'map-zoom-out', 'map-fit', 'map-reset']) {
    el<HTMLButtonElement>(id).disabled = !has;
  }
  el('map-zoom-level').textContent = `${Math.round((view?.viewport.scale ?? 1) * 100)}%`;
  el('map-empty').classList.toggle('hidden', has);
}

let pdfDocument: PdfDocument | null = null;

async function closePdf(): Promise<void> {
  const doc = pdfDocument;
  pdfDocument = null;
  el('pdf-panel').classList.add('hidden');
  el('pdf-status').textContent = '';
  if (doc) await doc.close().catch(() => undefined);
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
  if (!doc || !mapView) return;
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
  el('pdf-panel').classList.remove('hidden');
  select.focus();
}

// OpenStreetMap data (FR-31): parsed locally and rendered to an image that
// becomes the background like an image file or a PDF page.
type OsmOutcome = 'ok' | 'malformed' | 'empty' | 'render' | 'decode';

// Renders OpenStreetMap data as the background. A local file reports its
// failures in the map area; a fetch reports them in its own panel.
export async function useOsmText(text: string, fetched?: { bounds: OsmBounds; attribution: string }): Promise<OsmOutcome> {
  let src: string;
  try {
    const data = parseOsm(text);
    // Fetched data carries no bounds element: the requested area is the extent.
    if (fetched) data.bounds = fetched.bounds;
    src = renderPlanToDataUrl(planRender(data), fetched?.attribution);
  } catch (e) {
    const outcome: OsmOutcome = e instanceof OsmError ? (e.code === 'empty' ? 'empty' : 'malformed') : 'render';
    if (!fetched) showMapError(outcome === 'empty' ? 'osm-empty' : outcome === 'malformed' ? 'osm-malformed' : 'osm-render');
    return outcome;
  }
  await closePdf();
  return (await mapView?.setBackgroundSource(src)) ? 'ok' : 'decode';
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

// Open-map fetch, FR-31: the application's only network operation, made
// only from this panel, by explicit button presses. While a request runs the
// panel is busy and the request can be cancelled; every failure is reported
// in plain language with the service's own status.
let fetchSelected: PlaceResult | null = null;
let fetchResults: PlaceResult[] = [];
let fetchAbort: AbortController | null = null;
let fetchMessage: { text: string; kind: 'info' | 'error' } | null = null;
let fetchInvalidField: BoundsField | null = null;

const EDGES: BoundsField[] = ['south', 'west', 'north', 'east'];

function edgeName(field: BoundsField): string {
  const t = strings(state.prefs.lang);
  return { south: t.fetchSouth, west: t.fetchWest, north: t.fetchNorth, east: t.fetchEast }[field];
}

function formatBounds(b: OsmBounds): string {
  const t = strings(state.prefs.lang);
  const f = (v: number) => v.toFixed(5);
  return `${t.fetchSouth} ${f(b.minLat)}, ${t.fetchWest} ${f(b.minLon)}, ${t.fetchNorth} ${f(b.maxLat)}, ${t.fetchEast} ${f(b.maxLon)}`;
}

// The service's answer, named in the message rather than swallowed.
function serviceStatus(e: FetchError): string {
  const t = strings(state.prefs.lang);
  if (e.detail.status !== undefined) return ` ${t.fetchServiceSaid} HTTP ${e.detail.status}${httpReason(e.detail.status)}.`;
  if (e.detail.message) return ` ${t.fetchServiceSaid} "${e.detail.message}".`;
  return '';
}

function httpReason(status: number): string {
  const reasons: Record<number, string> = {
    400: 'Bad Request',
    403: 'Forbidden',
    404: 'Not Found',
    408: 'Request Timeout',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };
  return reasons[status] ? ` (${reasons[status]})` : '';
}

function fetchErrorText(e: FetchError, stage: 'search' | 'data'): string {
  const t = strings(state.prefs.lang);
  const field = e.detail.field ? edgeName(e.detail.field) : '';
  const texts: Record<FetchErrorCode, string> = {
    offline: t.fetchErrorOffline,
    cancelled: t.fetchCancelled,
    network: t.fetchErrorNetwork,
    timeout: t.fetchErrorTimeout,
    refused: t.fetchErrorRefused,
    service: t.fetchErrorService,
    'no-results': stage === 'search' ? t.fetchErrorNoResults : t.fetchErrorNoFeatures,
    'too-much-data': t.fetchErrorTooMuchData,
    'not-a-number': t.fetchErrorNotANumber.replace('{field}', field),
    'out-of-range': t.fetchErrorOutOfRange
      .replace('{field}', field)
      .replaceAll('{limit}', e.detail.field === 'south' || e.detail.field === 'north' ? '90' : '180'),
    'south-north': t.fetchErrorSouthNorth,
    'west-east': t.fetchErrorWestEast,
  };
  return texts[e.code] + serviceStatus(e);
}

function fetchMode(): 'place' | 'bbox' {
  return el<HTMLInputElement>('fetch-mode-bbox').checked ? 'bbox' : 'place';
}

function edgeInput(field: BoundsField): HTMLInputElement {
  return el<HTMLInputElement>(`fetch-${field}`);
}

function renderFetchState(): void {
  const t = strings(state.prefs.lang);
  const online = isOnline();
  const busy = fetchAbort !== null;
  const open = el<HTMLButtonElement>('fetch-open');
  open.disabled = !online;
  open.title = online ? '' : t.fetchOffline;
  el('fetch-offline').classList.toggle('hidden', online);
  const panel = el('fetch-panel');
  panel.setAttribute('aria-busy', busy ? 'true' : 'false');
  panel.dataset.busy = busy ? 'true' : 'false';
  const mode = fetchMode();
  el('fetch-place-row').classList.toggle('hidden', mode !== 'place');
  el('fetch-results').classList.toggle('hidden', mode !== 'place');
  el('fetch-bbox-row').classList.toggle('hidden', mode !== 'bbox');
  for (const id of ['fetch-mode-place', 'fetch-mode-bbox', 'fetch-place']) el<HTMLInputElement>(id).disabled = busy;
  for (const field of EDGES) {
    const input = edgeInput(field);
    input.disabled = busy;
    input.setAttribute('aria-invalid', fetchInvalidField === field ? 'true' : 'false');
  }
  el<HTMLButtonElement>('fetch-search').disabled = !online || busy;
  const ready = mode === 'place' ? fetchSelected !== null : EDGES.every((f) => edgeInput(f).value.trim() !== '');
  el<HTMLButtonElement>('fetch-go').disabled = !online || busy || !ready;
  el('fetch-cancel').classList.toggle('hidden', !busy);
  const list = el('fetch-results');
  list.innerHTML = '';
  for (const place of fetchResults) {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fetch-result';
    button.textContent = place.name;
    button.disabled = busy;
    button.setAttribute('aria-pressed', fetchSelected === place ? 'true' : 'false');
    button.addEventListener('click', () => {
      fetchSelected = place;
      fetchMessage = null;
      renderFetchState();
    });
    li.appendChild(button);
    list.appendChild(li);
  }
  const status = el('fetch-status');
  status.textContent = fetchMessage?.text ?? '';
  status.classList.toggle('error', fetchMessage?.kind === 'error');
  status.classList.toggle('busy', busy);
}

function startFetchRequest(text: string): AbortSignal {
  fetchAbort = new AbortController();
  fetchMessage = { text, kind: 'info' };
  renderFetchState();
  return fetchAbort.signal;
}

function endFetchRequest(): void {
  fetchAbort = null;
}

async function searchFetchPlace(): Promise<void> {
  const t = strings(state.prefs.lang);
  fetchSelected = null;
  fetchResults = [];
  const signal = startFetchRequest(t.fetchSearching);
  try {
    fetchResults = await searchPlace(el<HTMLInputElement>('fetch-place').value, signal);
    fetchMessage = { text: t.fetchChoose, kind: 'info' };
  } catch (e) {
    const err = e instanceof FetchError ? e : new FetchError('service');
    fetchMessage = { text: fetchErrorText(err, 'search'), kind: err.code === 'cancelled' ? 'info' : 'error' };
  }
  endFetchRequest();
  renderFetchState();
}

async function fetchOpenMap(): Promise<void> {
  const t = strings(state.prefs.lang);
  let requested: OsmBounds;
  fetchInvalidField = null;
  try {
    requested =
      fetchMode() === 'bbox'
        ? parseBounds({
            south: edgeInput('south').value,
            west: edgeInput('west').value,
            north: edgeInput('north').value,
            east: edgeInput('east').value,
          })
        : fetchSelected!.bounds;
  } catch (e) {
    const err = e instanceof FetchError ? e : new FetchError('not-a-number');
    fetchInvalidField = err.detail.field ?? null;
    fetchMessage = { text: fetchErrorText(err, 'data'), kind: 'error' };
    renderFetchState();
    if (fetchInvalidField) edgeInput(fetchInvalidField).focus();
    return;
  }
  // A larger area is reduced about its centre; the reduction is stated.
  const bounds = fetchableBounds(requested);
  const reduced = bounds !== requested;
  const reduction = reduced ? `${t.fetchReduced} ${formatBounds(bounds)}.` : '';
  const signal = startFetchRequest(reduced ? `${reduction} ${t.fetchFetching}` : t.fetchFetching);
  showMapError(null);
  try {
    const text = await fetchMapData(bounds, signal);
    const outcome = await useOsmText(text, { bounds, attribution: t.fetchAttribution });
    if (outcome === 'ok') fetchMessage = { text: reduced ? `${reduction} ${t.fetchDone}` : t.fetchDone, kind: 'info' };
    else if (outcome === 'empty') fetchMessage = { text: fetchErrorText(new FetchError('no-results'), 'data'), kind: 'error' };
    else fetchMessage = { text: fetchErrorText(new FetchError('service', { message: t.fetchUnreadableData }), 'data'), kind: 'error' };
  } catch (e) {
    const err = e instanceof FetchError ? e : new FetchError('service');
    fetchMessage = { text: fetchErrorText(err, 'data'), kind: err.code === 'cancelled' ? 'info' : 'error' };
  }
  endFetchRequest();
  renderFetchState();
}

function initialiseFetch(): void {
  el('fetch-open').addEventListener('click', () => {
    el('fetch-panel').classList.remove('hidden');
    renderFetchState();
    (fetchMode() === 'place' ? el<HTMLInputElement>('fetch-place') : edgeInput('south')).focus();
  });
  el('fetch-close').addEventListener('click', () => {
    fetchAbort?.abort();
    el('fetch-panel').classList.add('hidden');
  });
  el('fetch-cancel').addEventListener('click', () => fetchAbort?.abort());
  for (const id of ['fetch-mode-place', 'fetch-mode-bbox']) el(id).addEventListener('change', renderFetchState);
  for (const field of EDGES) {
    edgeInput(field).addEventListener('input', () => {
      if (fetchInvalidField === field) fetchInvalidField = null;
      renderFetchState();
    });
    edgeInput(field).addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' && !el<HTMLButtonElement>('fetch-go').disabled) void fetchOpenMap();
    });
  }
  el('fetch-search').addEventListener('click', () => void searchFetchPlace());
  el('fetch-place').addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter' && !el<HTMLButtonElement>('fetch-search').disabled) void searchFetchPlace();
  });
  el('fetch-go').addEventListener('click', () => void fetchOpenMap());
  window.addEventListener('online', renderFetchState);
  window.addEventListener('offline', renderFetchState);
  renderFetchState();
}

async function loadBackgroundFile(file: File): Promise<void> {
  showMapError(null);
  if (isOsmFile(file)) await loadOsmFile(file);
  else if (isPdfFile(file)) await loadPdfFile(file);
  else await mapView?.loadImageFile(file);
}

function initialiseMapView(): void {
  mapView = new MapView(el('map-stage'), el('map-content'), el<HTMLImageElement>('map-image'), {
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
  });
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
    if (file) void loadBackgroundFile(file);
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
    if (!row || !isSymbol(value)) return;
    state.shapes.set(row, value);
    markDirty();
    renderMapItems();
    renderDetailsPanel();
  });
  el('marker-remove').addEventListener('click', () => {
    if (state.selectedMarker) deleteMarker(state.selectedMarker);
  });

  const stage = el('map-stage');
  stage.addEventListener('dragover', (e) => {
    e.preventDefault();
    stage.classList.add('dragover');
  });
  stage.addEventListener('dragleave', () => stage.classList.remove('dragover'));
  stage.addEventListener('pointerdown', (e) => {
    if (!(e.target as HTMLElement).closest('.marker') && state.selectedMarker) selectMarker(null);
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
    if (file) void loadBackgroundFile(file);
  });
}

// Closing or reloading the page with unsaved work asks the browser to
// confirm. Nothing is ever written automatically: work reaches a file only
// through Save.
function guardUnsavedWork(e: BeforeUnloadEvent): void {
  if (!state.dirty) return;
  e.preventDefault();
  e.returnValue = '';
}

function wireEvents(): void {
  window.addEventListener('beforeunload', guardUnsavedWork);
  el('work-save').addEventListener('click', () => void saveWork());
  const addArea = () => {
    const input = el<HTMLInputElement>('area-new');
    const next = addValue(state.areaValues, input.value);
    input.value = '';
    if (next !== state.areaValues) setAreaValues(next);
  };
  el('area-add').addEventListener('click', addArea);
  el('area-new').addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') addArea();
  });
  el('area-collect').addEventListener('click', collectAreaValues);
  const addStatusValue = () => {
    const input = el<HTMLInputElement>('status-new');
    const next = addStatus(state.statuses, input.value, DEFAULT_SHAPE);
    input.value = '';
    if (next !== state.statuses) setStatuses(next);
  };
  el('status-add').addEventListener('click', addStatusValue);
  el('symbols-from-status').addEventListener('change', (e) => setSymbolsFromStatus((e.target as HTMLInputElement).checked));
  el('status-new').addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') addStatusValue();
  });
  el('start-empty').addEventListener('click', startEmptyList);
  el('load-demo').addEventListener('click', () => void loadDemo());
  el('add-row').addEventListener('click', addManualRow);
  el('add-column').addEventListener('click', addManualColumn);
  el('new-column-name').addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') addManualColumn();
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
    if ((e as KeyboardEvent).key === 'Enter') saveCurrentPreset();
  });
  const workInput = el<HTMLInputElement>('work-file-input');
  el('work-open').addEventListener('click', () => workInput.click());
  workInput.addEventListener('change', () => {
    const file = workInput.files?.[0];
    if (file) void openWorkFile(file);
    workInput.value = '';
  });
  el('segment-nav').addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLElement>('.segment-tab');
    if (tab && isSegment(tab.dataset.segment)) setSegment(tab.dataset.segment);
  });
  el('segment-nav').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
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
    if (file) void handleFile(file);
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
    if (file) void handleFile(file);
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

  el('compare-close').addEventListener('click', closeComparison);
  el('compare-select-all').addEventListener('click', selectAllDiffering);
  el('compare-adopt').addEventListener('click', adoptPositions);
  el('details-panel').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') openDetails(null);
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
const VIEWER_HIDDEN = ['compare-panel', 'segment-nav', 'work-controls', 'export-separator', 'export-open', 'export-panel', 'export-status', 'segment-information', 'segment-map', 'details-panel'];

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
    if (!(e instanceof ExportError)) throw e;
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
  await applyWorkState(data.workState);
  state.numbers = new Map(state.ingested.map((row, i) => [row, data.numbers[i]]));
  const labels = data.labels;
  state.viewerLabels = labels ? new Map(state.ingested.map((row, i) => [row, labels[i]])) : null;
  workMessage = null;
  const badge = el('viewer-badge');
  badge.dataset.exportedAt = data.exportedAt;
  badge.classList.remove('hidden');
  renderViewerBadge();
  renderList();
  setSegment('presentation');
}

function renderViewerBadge(): void {
  const badge = el('viewer-badge');
  const at = badge.dataset.exportedAt;
  if (!state.viewOnly || !at) return;
  badge.textContent = fill(strings(state.prefs.lang).viewerBadge, { date: formatCommentDate(at) });
}

export function main(): void {
  const island = readDataIsland(document);
  state.viewOnly = island !== null;
  if (state.viewOnly) state.segment = 'presentation';
  initialisePreferences();
  initialiseMapView();
  initialisePresentation();
  initialiseFetch();
  wireEvents();
  renderStaticText();
  renderMapItems();
  setSegment(state.segment);
  if (island !== null) void startViewer(island);
}

document.addEventListener('DOMContentLoaded', main);
