import { applyFilter, counters, COLOURS, makeRow, numberRows, NO_FILTER, sortRows, type NumberedRow, type RowColour, type RowData, type SortDirection, type ValueFilter } from './dataset';
import { parseWorkbook, ParseError, applyMapping, type ColumnMapping, type ColumnRole, type ParseResult } from './ingest';
import { strings, type Lang } from './i18n';
import { loadPreferences, savePreferences, type Preferences, type ThemeChoice } from './preferences';

const DEFAULT_COLOUR: RowColour = 'green';

interface AppState {
  prefs: Preferences;
  parse: ParseResult | null;
  mapping: ColumnMapping[];
  headers: string[];
  rows: RowData[];
  ingestedTotal: number;
  visibleHeaders: string[];
  hiddenHeaders: Set<string>;
  filter: ValueFilter;
  sort: { header: string | null; direction: SortDirection };
  selected: Set<string>;
  nextRowId: number;
  rowIds: Map<RowData, string>;
}

const state: AppState = {
  prefs: loadPreferences(),
  parse: null,
  mapping: [],
  headers: [],
  rows: [],
  ingestedTotal: 0,
  visibleHeaders: [],
  hiddenHeaders: new Set(),
  filter: { ...NO_FILTER },
  sort: { header: null, direction: 'asc' },
  selected: new Set(),
  nextRowId: 1,
  rowIds: new Map(),
};

function rowId(row: RowData): string {
  let id = state.rowIds.get(row);
  if (!id) {
    id = `row-${state.nextRowId++}`;
    state.rowIds.set(row, id);
  }
  return id;
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
  el('app-name').textContent = t.appName;
  el('list-heading').textContent = t.listArea;
  el('map-heading').textContent = t.mapArea;
  el('map-placeholder').textContent = t.mapPlaceholder;
  el('label-language').textContent = t.language;
  el('label-theme').textContent = t.theme;
  el('drop-hint').textContent = t.dropHere;
  el('browse-button').textContent = t.browse;
  el('mapping-heading').textContent = t.mapColumns;
  el('mapping-intro').textContent = t.mapColumnsIntro;
  el('th-column').textContent = t.columnHeader;
  el('th-keep').textContent = t.keep;
  el('th-role').textContent = t.role;
  el('apply-mapping').textContent = t.applyMapping;
  el('label-filter').textContent = t.filter;
  el('columns-summary').textContent = t.columns;
  el('select-all').textContent = t.selectAll;
  el('delete-selected').textContent = t.deleteSelected;
  el('no-file').textContent = t.noFileLoaded;
  el('empty-list').textContent = t.emptyList;
  el('counter-selected').textContent = `${t.selected}: ${state.selected.size}`;
  el('counter-retained').textContent = `${t.retained}: ${currentCounters().retained}`;
  el('counter-removed').textContent = `${t.removed}: ${currentCounters().removed}`;
  const filterKind = el<HTMLSelectElement>('select-filter-kind');
  const options = filterKind.options;
  options[0].textContent = t.filterAll;
  options[1].textContent = t.filterEmpty;
  options[2].textContent = t.filterNonEmpty;
  options[3].textContent = t.filterContains;
}

function currentCounters() {
  return counters(state.ingestedTotal, state.rows.length);
}

function setLanguage(lang: Lang): void {
  state.prefs.lang = lang;
  savePreferences(state.prefs);
  el<HTMLSelectElement>('select-language').value = lang;
  renderStaticText();
  renderMappingTable();
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

async function handleFile(file: File): Promise<void> {
  const errorEl = el('ingest-error');
  errorEl.classList.add('hidden');
  try {
    const buffer = await file.arrayBuffer();
    const parse = parseWorkbook(buffer);
    state.parse = parse;
    state.mapping = parse.headers.map((header, i) => ({
      header,
      keep: true,
      role: 'none' as ColumnRole,
    }));
    renderMappingTable();
    el('mapping-panel').classList.remove('hidden');
    el('list-panel').classList.add('hidden');
    el('no-file').classList.add('hidden');
    errorEl.classList.add('hidden');
  } catch (e) {
    const t = strings(state.prefs.lang);
    const detail = e instanceof ParseError && e.message ? e.message : '';
    errorEl.textContent = detail ? `${t.parseError} ${detail}` : t.parseError;
    errorEl.classList.remove('hidden');
  }
}

function renderMappingTable(): void {
  const t = strings(state.prefs.lang);
  const body = el('mapping-body');
  body.innerHTML = '';
  if (!state.parse) return;
  state.mapping.forEach((entry, i) => {
    const tr = document.createElement('tr');
    const headerTd = document.createElement('td');
    headerTd.textContent = entry.header === '' ? t.untitledHeader : entry.header;
    const keepTd = document.createElement('td');
    const keepInput = document.createElement('input');
    keepInput.type = 'checkbox';
    keepInput.checked = entry.keep;
    keepInput.dataset.index = String(i);
    keepInput.className = 'mapping-keep';
    keepInput.addEventListener('change', () => {
      state.mapping[i].keep = keepInput.checked;
    });
    keepTd.appendChild(keepInput);
    const roleTd = document.createElement('td');
    const roleSelect = document.createElement('select');
    roleSelect.dataset.index = String(i);
    roleSelect.className = 'mapping-role';
    const roleOptions: Array<[ColumnRole, string]> = [
      ['none', t.roleNone],
      ['identifier', t.roleIdentifier],
      ['start', t.roleStart],
      ['end', t.roleEnd],
      ['area', t.roleArea],
    ];
    roleOptions.forEach(([value, label]) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      roleSelect.appendChild(opt);
    });
    roleSelect.value = entry.role;
    roleSelect.addEventListener('change', () => {
      state.mapping[i].role = roleSelect.value as ColumnRole;
    });
    roleTd.appendChild(roleSelect);
    tr.append(headerTd, keepTd, roleTd);
    body.appendChild(tr);
  });
}

function applyMappingAndImport(): void {
  if (!state.parse) return;
  const { headers, rows } = applyMapping(state.parse, state.mapping);
  state.headers = headers;
  state.rows = rows.map((r) => makeRow(r.values));
  state.ingestedTotal = state.rows.length;
  state.hiddenHeaders = new Set();
  state.filter = { ...NO_FILTER };
  state.sort = { header: null, direction: 'asc' };
  state.selected = new Set();
  state.visibleHeaders = [...headers];
  el('mapping-panel').classList.add('hidden');
  el('list-panel').classList.remove('hidden');
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

  const numberTh = document.createElement('th');
  numberTh.textContent = t.numberColumn;
  head.appendChild(numberTh);

  state.headers.forEach((header) => {
    const th = document.createElement('th');
    th.textContent = header;
    th.className = 'sortable';
    th.dataset.header = header;
    if (state.sort.header === header) {
      th.dataset.sort = state.sort.direction;
    }
    th.addEventListener('click', () => {
      if (state.sort.header === header) {
        state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort = { header, direction: 'asc' };
      }
      renderList();
    });
    head.appendChild(th);
  });

  const colourTh = document.createElement('th');
  colourTh.textContent = t.colour;
  head.appendChild(colourTh);

  const rows = displayedRows();
  rows.forEach(({ row, number }) => {
    const tr = document.createElement('tr');
    const id = rowId(row);
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

    state.headers.forEach((header) => {
      const td = document.createElement('td');
      td.textContent = row.values[header] ?? '';
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

  el('empty-list').classList.toggle('hidden', rows.length > 0);
  el('counter-selected').textContent = `${t.selected}: ${state.selected.size}`;
  el('counter-retained').textContent = `${t.retained}: ${currentCounters().retained}`;
  el('counter-removed').textContent = `${t.removed}: ${currentCounters().removed}`;

  renderFilterColumnSelect();
  renderColumnVisibility();
}

function renderFilterColumnSelect(): void {
  const select = el<HTMLSelectElement>('select-filter-column');
  const previous = select.value;
  select.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = strings(state.prefs.lang).columnHeader;
  select.appendChild(placeholder);
  state.headers.forEach((header) => {
    const opt = document.createElement('option');
    opt.value = header;
    opt.textContent = header;
    select.appendChild(opt);
  });
  select.value = state.headers.includes(previous) ? previous : '';
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
    label.append(input, document.createTextNode(header));
    container.appendChild(label);
  });
}

function deleteSelected(): void {
  const toRemove = new Set(state.selected);
  state.rows = state.rows.filter((r) => !toRemove.has(rowId(r)));
  state.selected = new Set();
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

function wireEvents(): void {
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

  el('apply-mapping').addEventListener('click', applyMappingAndImport);

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

function main(): void {
  initialisePreferences();
  wireEvents();
  renderStaticText();
}

document.addEventListener('DOMContentLoaded', main);
