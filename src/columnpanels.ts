// The column panels: series roles, presets, symbols and colours,
// numbering, the vocabularies, and the events.
import { COLOURS, type RowColour, type RowData } from './dataset';
import {
  statusSymbol,
  addValue,
  collectValues,
  mergeValues,
  moveStatus,
  removeStatus,
  removeValue,
  renameStatus,
  renameValue,
  setStatusSymbol,
  type StatusEntry,
} from './vocab';
import { presetConfiguration, presetMatches, removePreset, storePresets, upsertPreset, type ColumnPreset } from './presets';
import { assignRole, listColumnOrder, type Role } from './roles';
import { strings, type Strings } from './i18n';
import { colourName, shapeName, type ColourLabels, type LegendGroup, type SymbolLabels } from './legend';
import { drawSymbol, isSymbol, SYMBOLS, symbolClasses, type MarkerSymbol } from './symbols';
import { DEFAULT_SHAPE } from './markers';
import type { StoredEvent } from './workstate';
import { readDate } from './dates';
import { proposeSeries, SERIES_ROLES, seriesKey, type SeriesAssignments, type SeriesProposal, type SeriesRole } from './economics';
import { el, fill, state } from './appstate';
import { markDirty } from './workfile';
import { keptSeries } from './exportdialog';
import { renderPresentation } from './presentationstage';
import { groupedNumbering, labelOf, numbered, renderList } from './listpanel';

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

export function renderSeriesPanel(): void {
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

// The column whose value names an item in the placement list: the column
// assigned the identifier role, otherwise the first kept column.
// Column presets (FR-23).
let presetMessage: { kind: 'auto' | 'applied' | 'saved' | 'removed'; name: string } | null = null;
export function setPresetMessage(value: { kind: 'auto' | 'applied' | 'saved' | 'removed'; name: string } | null): void {
  presetMessage = value;
}

export function applyPreset(preset: ColumnPreset, kind: 'auto' | 'applied'): void {
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

export function applySelectedPreset(): void {
  const preset = state.presets.find((p) => p.name === el<HTMLSelectElement>('preset-select').value);
  if (!preset) {
    return;
  }
  applyPreset(preset, 'applied');
  markDirty();
  renderList();
}

export function saveCurrentPreset(): void {
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

export function removeSelectedPreset(): void {
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

export function renderPresets(): void {
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

export function setSymbolsFromStatus(on: boolean): void {
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

export function renderSymbolPanel(): void {
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

export function renderColourPanel(): void {
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

export function setNumbering(mode: 'global' | 'grouped'): void {
  state.numbering = mode;
  renderList();
}

export function renderNumbering(): void {
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
export function setStatuses(next: StatusEntry[]): void {
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

export function renderStatusPanel(): void {
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
export const VALUE_VOCABULARIES: ValueVocabulary[] = ['area', 'program'];
const vocabMessages: Record<ValueVocabulary, string> = { area: '', program: '' };

export function vocabValues(kind: ValueVocabulary): string[] {
  return kind === 'area' ? state.areaValues : state.programValues;
}

export function vocabularyOfColumn(key: string): ValueVocabulary | null {
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

export function collectVocabValues(kind: ValueVocabulary): void {
  const t = strings(state.prefs.lang);
  const key = state.roles[kind];
  if (key === undefined) {
    return;
  }
  const before = vocabValues(kind).length;
  const next = mergeValues(vocabValues(kind), collectValues(state.rows, key));
  setVocabValues(kind, next, fill(t.vocabCollected, { count: next.length - before }));
}

export function addVocabValue(kind: ValueVocabulary): void {
  const input = el<HTMLInputElement>(`${kind}-new`);
  const before = vocabValues(kind);
  const next = addValue(before, input.value);
  input.value = '';
  if (next !== before) {
    setVocabValues(kind, next);
  }
}

export function renderVocabPanel(kind: ValueVocabulary): void {
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

export function addEvent(): void {
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

export function renderEventPanel(): void {
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

export function setColumnRole(header: string, role: Role | null): void {
  state.roles = assignRole(state.roles, header, role);
  markDirty();
  renderList();
}
