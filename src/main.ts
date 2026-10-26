import { applyFilter, counters, COLOURS, makeRow, numberRows, NO_FILTER, sortRows, type NumberedRow, type RowColour, type RowData, type SortDirection, type ValueFilter } from './dataset';
import { importColumns, parseWorkbook, ParseError, type ParseResult } from './ingest';
import { columnLabel } from './columns';
import { emptyValues, newManualKey } from './manual';
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
import { renderLegend, shapeName } from './legend';
import { markersInView } from './glance';
import { DEFAULT_SHAPE, isShape, placedMarkers, placeMarker, pruneMarkers, removeMarker, SHAPES, type MarkerPositions, type MarkerShapes, type PlacedMarker } from './markers';
import { BUTTON_ZOOM_FACTOR, imageToScreen, screenToImage, type Point } from './viewport';
import { isSegment, SEGMENTS, showSegment, type Segment } from './segments';
import { type Problem, parseWorkState, serialiseWorkState, SUGGESTED_FILE_NAME, WorkStateError, type WorkState } from './workstate';

const DEFAULT_COLOUR: RowColour = 'green';

interface AppState {
  prefs: Preferences;
  roles: RoleAssignments;
  // Manual columns (FR-24): key to label; and the rows added by hand (FR-9).
  manualColumns: Map<string, string>;
  manualRows: Set<RowData>;
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
}

const state: AppState = {
  prefs: loadPreferences(),
  roles: {},
  manualColumns: new Map(),
  manualRows: new Set(),
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
  renderLegend(el('map-legend'), t);
  renderLegend(el('presentation-legend'), t);
  el('visibility-heading').textContent = t.visibilityHeading;
  el('visibility-hint').textContent = t.visibilityHint;
  el('visibility-empty').textContent = t.visibilityEmpty;
  el('presentation-empty-hint').textContent = t.presentationEmptyHint;
  el('pres-fit').textContent = t.mapFit;
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
  savePreferences(state.prefs);
  el<HTMLSelectElement>('select-language').value = lang;
  renderStaticText();
  renderList();
}

function setTheme(theme: ThemeChoice): void {
  state.prefs.theme = theme;
  savePreferences(state.prefs);
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

// Starts an empty list with no import (FR-30); rows and columns are then
// added by hand.
function startEmptyList(): void {
  if (state.dirty && !window.confirm(strings(state.prefs.lang).manualConfirmReplace)) return;
  el('ingest-error').classList.add('hidden');
  resetList([], []);
  renderList();
}

function resetList(headers: string[], rows: Record<string, string>[]): void {
  state.headers = headers;
  state.roles = {};
  state.manualColumns = new Map();
  state.manualRows = new Set();
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

// A cell is edited by hand when it belongs to a manual row or a manual
// column; imported values of imported columns are not edited here (FR-10
// remains deferred).
function isEditableCell(row: RowData, key: string): boolean {
  return state.manualRows.has(row) || state.manualColumns.has(key);
}

function setCellValue(row: RowData, key: string, value: string): void {
  if (!isEditableCell(row, key) || row.values[key] === value) return;
  row.values[key] = value;
  markDirty();
  renderList();
}

function displayedRows(): NumberedRow[] {
  let rows = numberRows(state.rows);
  if (state.sort.header) {
    const sorted = sortRows(state.rows, state.sort.header, state.sort.direction);
    const numbers = new Map<RowData, number>();
    numberRows(state.rows).forEach((n) => numbers.set(n.row, n.number));
    rows = sorted.map((row) => ({ row, number: numbers.get(row) ?? 0 }));
  }
  return applyFilter(rows, state.filter);
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

  const rows = displayedRows();
  rows.forEach(({ row, number }) => {
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
    numTd.textContent = String(number);
    tr.append(selectTd, numTd);

    columns.forEach((header) => {
      const td = document.createElement('td');
      if (isEditableCell(row, header)) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'cell-input';
        input.value = row.values[header] ?? '';
        input.dataset.header = header;
        input.setAttribute('aria-label', `${labelOf(header)}, ${t.numberColumn} ${number}`);
        input.addEventListener('change', () => setCellValue(row, header, input.value));
        td.appendChild(input);
        td.classList.add('editable');
      } else {
        td.textContent = row.values[header] ?? '';
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
  });

  const allSelected = rows.length > 0 && rows.every(({ row }) => state.selected.has(rowId(row)));
  const selectAllInput = el<HTMLButtonElement>('select-all');
  selectAllInput.textContent = t.selectAll;
  el('delete-selected').textContent = t.deleteSelected;
  selectAllInput.dataset.allSelected = allSelected ? 'true' : 'false';

  renderMapItems();
  renderWorkStatus();

  el('empty-list').classList.toggle('hidden', rows.length > 0);
  el('counter-selected').textContent = `${t.selected}: ${state.selected.size}`;
  el('counter-retained').textContent = `${t.retained}: ${currentCounters().retained}`;
  el('counter-removed').textContent = `${t.removed}: ${currentCounters().removed}`;

  renderFilterColumnSelect();
  renderColumnVisibility();
  renderPresets();
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
  const rows = displayedRows();
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
    .map(([row, position]) => ({ row: index.get(row)!, position: { ...position }, shape: state.shapes.get(row) ?? DEFAULT_SHAPE }))
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
    })),
    background: bg ? { ...bg } : null,
    markers,
    excluded: [...state.excluded].filter((row) => retained.has(row)).map((row) => index.get(row)!).sort((a, b) => a - b),
    presets: state.presets.map(clonePreset),
    segment: state.segment,
    viewport: { ...(mapView?.viewport ?? { scale: 1, x: 0, y: 0 }) },
    sort: { ...state.sort },
    filter: { ...state.filter },
  };
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
async function writeWorkStateFile(text: string): Promise<WriteOutcome> {
  const blob = new Blob([text], { type: 'application/json' });
  const picker = (window as unknown as SaveFilePickerWindow).showSaveFilePicker;
  if (typeof picker === 'function') {
    try {
      const handle = await picker.call(window, {
        suggestedName: SUGGESTED_FILE_NAME,
        types: [{ description: 'MapVibes work state', accept: { 'application/json': ['.json'] } }],
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
    a.download = SUGGESTED_FILE_NAME;
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

type WorkMessage = 'saved' | 'save-failed' | 'opened' | 'open-failed';
let workMessage: WorkMessage | null = null;
let workErrorText = '';

// Content changes mark the work as unsaved: the ingested rows, removals,
// colours, the background, and markers. View changes (segment, zoom and pan,
// list sorting, filtering, and column visibility) are saved with the work
// but do not by themselves count as unsaved changes.
function markDirty(): void {
  state.dirty = true;
  if (workMessage === 'saved' || workMessage === 'opened') workMessage = null;
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
  };
  status.textContent = workMessage ? messages[workMessage] : '';
  status.classList.toggle('error', workMessage === 'save-failed' || workMessage === 'open-failed');
  el<HTMLButtonElement>('work-save').disabled = !hasWork();
  el('work-dirty').textContent = t.workUnsaved;
  el('work-dirty').classList.toggle('hidden', !state.dirty);
  document.documentElement.dataset.unsaved = state.dirty ? 'true' : 'false';
}

export async function saveWork(): Promise<WriteOutcome> {
  const text = serialiseWorkState(captureWorkState(), new Date());
  const outcome = await writeWorkStateFile(text);
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
  state.rowIds = new Map();
  state.selected = new Set();
  state.selectedMarker = null;
  state.positions = new Map(ws.markers.map((m) => [state.ingested[m.row], { ...m.position }]));
  state.excluded = new Set(ws.excluded.map((i) => state.ingested[i]));
  state.presentationSelected = null;
  state.shapes = new Map(ws.markers.map((m) => [state.ingested[m.row], m.shape]));
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
  let ws: WorkState;
  try {
    ws = parseWorkState(await readText(file));
  } catch (e) {
    reportOpenFailure(openErrorText(e));
    return false;
  }
  if (state.dirty && !window.confirm(strings(state.prefs.lang).workConfirmReplace)) return false;
  const ok = await applyWorkState(ws);
  if (!ok) reportOpenFailure(strings(state.prefs.lang).workOpenBackgroundFailed);
  return ok;
}

export function setSegment(segment: Segment): void {
  state.segment = segment;
  showSegment(document, segment);
  if (segment === 'map') mapView?.shown();
  if (segment === 'presentation') presentationView?.shown();
  // Panels depend on the stage size, which is known only while it is shown.
  renderMapItems();
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

function setColumnRole(header: string, role: Role | null): void {
  state.roles = assignRole(state.roles, header, role);
  markDirty();
  renderList();
}

// The display name of an item (FR-1): name/title, else identifier, else the
// item's number.
function itemLabel(row: RowData, number: number): string {
  return displayName(row.values, state.roles, `${strings(state.prefs.lang).numberColumn} ${number}`);
}

function markerLabel(marker: PlacedMarker): string {
  return `${strings(state.prefs.lang).markerLabel} ${marker.number}: ${itemLabel(marker.row, marker.number)}`;
}

function selectMarker(id: string | null): void {
  state.selectedMarker = id;
  renderMapItems();
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
  numberRows(state.rows).forEach(({ row, number }) => {
    const id = rowId(row);
    const placed = state.positions.has(row);
    const li = document.createElement('li');
    li.className = 'placement-item';
    li.draggable = true;
    li.dataset.rowId = id;
    li.dataset.placed = placed ? 'true' : 'false';
    if (state.selectedMarker === id) li.dataset.selected = 'true';
    const badge = document.createElement('span');
    badge.className = `marker-badge marker-${row.colour} marker-shape-${state.shapes.get(row) ?? 'circle'}`;
    badge.textContent = String(number);
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
  const markers = placedMarkers(state.rows, state.positions, state.shapes);
  markerLayer?.render(markers, state.selectedMarker);
  renderGlance('map', mapView, state.selectedMarker, (id) => selectMarker(id));
  renderPresentation();
  applyHighlight();
  renderPlacementList();
  const t = strings(state.prefs.lang);
  const selected = markers.find((m) => rowId(m.row) === state.selectedMarker);
  el('marker-selection').textContent = selected ? `${t.markerSelected}: ${selected.number}` : t.markerNoSelection;
  el<HTMLButtonElement>('marker-remove').disabled = !selected;
  const shapeSelect = el<HTMLSelectElement>('marker-shape');
  shapeSelect.disabled = !selected;
  if (shapeSelect.options.length !== SHAPES.length) {
    shapeSelect.innerHTML = '';
    for (const shape of SHAPES) {
      const opt = document.createElement('option');
      opt.value = shape;
      shapeSelect.appendChild(opt);
    }
  }
  for (const opt of shapeSelect.options) opt.textContent = shapeName(t, opt.value as (typeof SHAPES)[number]);
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

function selectPresentationItem(id: string | null): void {
  state.presentationSelected = id;
  renderMapItems();
}

function renderVisibilityList(): void {
  const t = strings(state.prefs.lang);
  const list = el('visibility-list');
  list.innerHTML = '';
  const placed = placedMarkers(state.rows, state.positions, state.shapes);
  for (const marker of placed) {
    const id = rowId(marker.row);
    const shown = !state.excluded.has(marker.row);
    const li = document.createElement('li');
    li.className = 'visibility-item';
    li.dataset.rowId = id;
    li.dataset.shown = shown ? 'true' : 'false';
    if (state.presentationSelected === id) li.dataset.selected = 'true';
    const label = document.createElement('label');
    label.className = 'visibility-control';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'visibility-toggle';
    toggle.dataset.rowId = id;
    toggle.checked = shown;
    const name = itemLabel(marker.row, marker.number);
    toggle.setAttribute('aria-label', `${t.visibilityShown}: ${name}`);
    toggle.addEventListener('change', () => setExcluded(marker.row, !toggle.checked));
    const badge = document.createElement('span');
    badge.className = `marker-badge marker-${marker.colour} marker-shape-${marker.shape}`;
    badge.textContent = String(marker.number);
    const text = document.createElement('span');
    text.className = 'placement-label';
    text.textContent = name;
    label.append(toggle, badge, text);
    li.appendChild(label);
    list.appendChild(li);
  }
  el('visibility-empty').classList.toggle('hidden', placed.length > 0);
  el('visibility-hint').classList.toggle('hidden', placed.length === 0);
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
  const candidates = placedMarkers(state.rows, state.positions, state.shapes).filter((m) => !state.excluded.has(m.row));
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
    badge.className = `marker-badge marker-${marker.colour} marker-shape-${marker.shape}`;
    badge.textContent = String(marker.number);
    const text = document.createElement('span');
    text.className = 'glance-text';
    const name = document.createElement('span');
    name.className = 'glance-name';
    name.textContent = itemLabel(marker.row, marker.number);
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

// The visibility control of a presentation marker, opened by clicking it.
let popoverId: string | null = null;

function openPopover(id: string | null): void {
  popoverId = id;
  renderPopover();
}

function renderPopover(): void {
  const popover = el('presentation-popover');
  const row = popoverId ? rowById(popoverId) : undefined;
  const position = row ? state.positions.get(row) : undefined;
  if (!row || !position || !presentationView) {
    popoverId = null;
    popover.classList.add('hidden');
    return;
  }
  const t = strings(state.prefs.lang);
  const number = state.rows.indexOf(row) + 1;
  const screen = imageToScreen(presentationView.viewport, position);
  popover.style.left = `${screen.x}px`;
  popover.style.top = `${screen.y}px`;
  popover.dataset.rowId = popoverId ?? '';
  el('popover-title').textContent = `${number}. ${itemLabel(row, number)}`;
  el('popover-visibility-label').textContent = t.visibilityShown;
  el<HTMLInputElement>('popover-visibility').checked = !state.excluded.has(row);
  el('popover-close').setAttribute('aria-label', t.close);
  el('popover-close').title = t.close;
  popover.classList.remove('hidden');
}

function renderPresentation(): void {
  const shown = placedMarkers(state.rows, state.positions, state.shapes).filter((m) => !state.excluded.has(m.row));
  if (state.presentationSelected && !shown.some((m) => rowId(m.row) === state.presentationSelected)) {
    state.presentationSelected = null;
  }
  presentationLayer?.render(shown, state.presentationSelected);
  renderVisibilityList();
  renderGlance('presentation', presentationView, state.presentationSelected, (id) => selectPresentationItem(id));
  renderPopover();
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
  });
  presentationLayer = new MarkerLayer(el('presentation-marker-layer'), {
    editable: false,
    viewport: () => presentationView?.viewport ?? { scale: 1, x: 0, y: 0 },
    stagePoint: (x, y) => presentationView?.stagePoint(x, y) ?? { x, y },
    rowId: (marker) => rowId(marker.row),
    markerLabel,
    onSelect: (id) => {
      selectPresentationItem(id);
      openPopover(id);
    },
    onMove: () => undefined,
    onRemove: () => undefined,
    onHover: setHover,
  });
  el<HTMLInputElement>('popover-visibility').addEventListener('change', (e) => {
    const row = popoverId ? rowById(popoverId) : undefined;
    if (row) setExcluded(row, !(e.target as HTMLInputElement).checked);
  });
  el('popover-close').addEventListener('click', () => openPopover(null));
  el('presentation-popover').addEventListener('pointerdown', (e) => e.stopPropagation());
  el('presentation-popover').addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Escape') openPopover(null);
  });
  el('pres-zoom-in').addEventListener('click', () => presentationView?.zoomBy(BUTTON_ZOOM_FACTOR));
  el('pres-zoom-out').addEventListener('click', () => presentationView?.zoomBy(1 / BUTTON_ZOOM_FACTOR));
  el('pres-fit').addEventListener('click', () => presentationView?.fit());
  el('pres-reset').addEventListener('click', () => presentationView?.reset());
  const stage = el('presentation-stage');
  stage.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.marker')) return;
    if (popoverId) openPopover(null);
    if (state.presentationSelected) selectPresentationItem(null);
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
    if (!row || !isShape(value)) return;
    state.shapes.set(row, value);
    markDirty();
    renderMapItems();
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
  el('start-empty').addEventListener('click', startEmptyList);
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

  el('select-all').addEventListener('click', selectAllVisible);
  el('delete-selected').addEventListener('click', deleteSelected);
}

export function main(): void {
  initialisePreferences();
  initialiseMapView();
  initialisePresentation();
  initialiseFetch();
  wireEvents();
  renderStaticText();
  renderMapItems();
  setSegment(state.segment);
}

document.addEventListener('DOMContentLoaded', main);
