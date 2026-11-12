// The list: import, manual rows and columns, numbering, sections, the
// table itself, and cell editing.
import { applyFilter, COLOURS, makeRow, numberRows, NO_FILTER, sortRows, type NumberedRow, type RowData } from './dataset';
import { importColumns, parseWorkbook, ParseError, type ParseResult } from './ingest';
import { columnLabel } from './columns';
import { emptyValues, newManualKey } from './manual';
import { addValue, hasValue, statusNames } from './vocab';
import { findMatchingPreset } from './presets';
import { isRole, listColumnOrder, roleOfColumn, ROLES, type Role } from './roles';
import { strings, type Strings } from './i18n';
import { areaGroups, programLabels } from './grouping';
import { DEFAULT_CURRENCY_UNIT } from './economics';
import { currentCounters, el, fill, rowId, state } from './appstate';
import { markDirty, renderWorkStatus } from './workfile';
import { renderComparison } from './exportdialog';
import { openDetails, renderDetailsPanel } from './detailspanel';
import { renderAnnotationInspector, renderAnnotationToolbar } from './annotationpanel';
import { itemLabel, renderMapItems } from './mapstage';
import {
  renderCardFieldPicker,
  renderEconomicsOverlay,
  renderGlanceColumnPicker,
  renderInformationTotals,
  renderLegends,
  restoreCostsView,
  restoreTimelineView,
} from './presentationstage';
import {
  applyPreset,
  colourLabel,
  renderColourPanel,
  renderEventPanel,
  renderNumbering,
  renderPresets,
  renderSeriesPanel,
  renderStatusPanel,
  renderSymbolPanel,
  renderVocabPanel,
  setColumnRole,
  setPresetMessage,
  VALUE_VOCABULARIES,
  vocabularyOfColumn,
  vocabValues,
} from './columnpanels';
import { demoLoaded, setDemoAnnotationIds, setDemoEventIds, setDemoLang, setDemoLoaded } from './demoload';
import { narrowApplication } from './narrowlayout';

// Import cap (FR-1 and FR-25): a spreadsheet or PDF file larger than this is
// refused before it is read, mirroring the OpenStreetMap and presentation-open
// caps.
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

// Direct import (FR-1): the list is populated immediately with every column
// of the file. Importing over unsaved work asks for confirmation first, as
// opening a work-state file does.
export async function handleFile(file: File): Promise<void> {
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

export function applyImport(parse: ParseResult): void {
  const { headers, rows } = importColumns(parse);
  resetList(headers, rows);
  const preset = findMatchingPreset(state.presets, headers);
  if (preset) {
    applyPreset(preset, 'auto');
  }
  renderList();
}

// Starts an empty list with no import (FR-30); rows and columns are then
// added by hand.
// Starts an empty list (FR-30) with four starter columns, named in the
// interface language and assigned the name, start, end, and note roles by
// key (hard constraint 5: the labels are interface text that no logic reads;
// the columns are ordinary manual columns, freely renamed or removed).
export function startEmptyList(): void {
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
  setDemoEventIds([]);
  // The card fields and the series name columns of the list they were made
  // on, and the unit belongs to that work (FR-62 to FR-64).
  state.cardColumns = null;
  state.series = {};
  state.currencyUnit = DEFAULT_CURRENCY_UNIT;
  setDemoLoaded(false);
  setDemoLang(null);
  setDemoAnnotationIds([]);
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
  setPresetMessage(null);
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
export function addManualRow(): void {
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
export function addManualColumn(): void {
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

export function setListView(view: 'flat' | 'grouped'): void {
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

export function deleteSelected(): void {
  const toRemove = new Set(state.selected);
  const before = state.rows.length;
  state.rows = state.rows.filter((r) => !toRemove.has(rowId(r)));
  state.selected = new Set();
  if (state.rows.length !== before) {
    markDirty();
  }
  renderList();
}

export function selectAllVisible(): void {
  const rows = listSections().flatMap((section) => (section.collapsed ? [] : section.rows));
  const allSelected = rows.every(({ row }) => state.selected.has(rowId(row)));
  if (allSelected) {
    rows.forEach(({ row }) => state.selected.delete(rowId(row)));
  } else {
    rows.forEach(({ row }) => state.selected.add(rowId(row)));
  }
  renderList();
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
