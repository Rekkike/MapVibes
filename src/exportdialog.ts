// The exported presentation: capture, the export dialog, the comparison
// with an exported file, and the viewer's start.
import { NO_FILTER, type RowData } from './dataset';
import { columnLabel } from './columns';
import { displayName, listColumnOrder, type RoleAssignments } from './roles';
import { strings } from './i18n';
import { formatCommentDate } from './comments';
import { placeMarker } from './markers';
import { rowNumbers, type WorkState } from './workstate';
import { ExportError, parseExport, type ExportData } from './exportfile';
import { readDataIsland } from './singlefile';
import { compareItems, type CompareItem, type Comparison } from './reconcile';
import { SERIES_ROLES, type SeriesAssignment, type SeriesAssignments } from './economics';
import { exportPage, groupedNumbering, hideDialog, labelOf, numbered, numberLabel, presentationView, showDialog, shownProgramGroups } from './main';
import { el, fill, rowById, rowId, state } from './appstate';
import { captureWorkState, EXPORT_FILE, markDirty, renderWorkStatus, reportOpenFailure, setWorkMessage, writeFile } from './workfile';
import { itemLabel, mapView, renderMapItems } from './mapstage';

// The interactive export (FR-11, FR-39): the work state the presentation
// shows, without the rows removed from the list, the items switched off for
// the presentation, the presets, and the values as imported before edits;
// with the presentation numbers and the presentation view.
interface ExportSummary {
  items: number;
  columns: number;
  allColumns: number;
  notShared: number;
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

// What the export shares (FR-53): the items chosen and the columns chosen.
// The choice starts from the visibility state when the dialog opens.
export interface ExportChoice {
  items: Set<RowData>;
  columns: Set<string>;
}

let exportChoice: ExportChoice | null = null;

function defaultExportChoice(): ExportChoice {
  return { items: new Set(state.rows.filter((r) => !state.excluded.has(r))), columns: new Set(state.headers) };
}

export function captureExport(choice: ExportChoice = exportChoice ?? defaultExportChoice()): { data: Omit<ExportData, 'exportedAt'>; summary: ExportSummary } {
  const ws = captureWorkState();
  const numbersAll = rowNumbers(ws.rows);
  const shown = ws.rows.map((_, i) => i).filter((i) => !ws.rows[i].removed && choice.items.has(state.ingested[i]));
  const newIndex = new Map(shown.map((old, i) => [old, i]));
  // Columns not chosen are absent from the file, not hidden in it.
  const keep = (key: string) => choice.columns.has(key);
  const headers = ws.headers.filter(keep);
  const pick = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).filter(([k]) => keep(k)));
  const rows = shown.map((i) => ({ ...ws.rows[i], values: pick(ws.rows[i].values), edited: {} }));
  const roles = Object.fromEntries(Object.entries(ws.roles).filter(([, key]) => key !== undefined && keep(key))) as RoleAssignments;
  // A vocabulary keeps only the values the shared items use, so that the
  // names of areas and programs left out are not in the file either.
  const used = (key: string | undefined) => new Set(key === undefined ? [] : rows.map((r) => (r.values[key] ?? '').trim()));
  const areasUsed = used(roles.area);
  const programsUsed = used(roles.program);
  const labels = groupedNumbering() ? labelsOf(shown) : null;
  const groups = labels ? shownProgramGroups().filter((g) => labels.some((l) => l.startsWith(`${g.index}.`))) : null;
  const workState: WorkState = {
    ...ws,
    headers,
    roles,
    manualColumns: ws.manualColumns.filter((c) => keep(c.key)),
    hiddenHeaders: ws.hiddenHeaders.filter(keep),
    rows,
    areaValues: ws.areaValues.filter((v) => areasUsed.has(v)),
    programValues: ws.programValues.filter((v) => programsUsed.has(v)),
    glanceColumns: ws.glanceColumns ? ws.glanceColumns.filter(keep) : null,
    // The card fields and the series travel with the columns that travel.
    cardColumns: ws.cardColumns ? ws.cardColumns.filter(keep) : null,
    series: keptSeries(ws.series, keep),
    markers: ws.markers.filter((m) => newIndex.has(m.row)).map((m) => ({ ...m, row: newIndex.get(m.row)! })),
    excluded: [],
    presets: [],
    // A linked annotation goes with its item (FR-48); a free annotation
    // switched off for the presentation is not exported.
    annotations: ws.annotations
      .filter((a) => (a.link !== null ? newIndex.has(a.link) : !a.hidden))
      .map((a) => ({ ...a, link: a.link !== null ? newIndex.get(a.link)! : null, hidden: false })),
    segment: 'presentation',
    viewport: { ...(presentationView?.viewport ?? ws.viewport) },
    sort: { header: null, direction: 'asc' },
    filter: { ...NO_FILTER },
  };
  const summary: ExportSummary = {
    items: rows.length,
    columns: headers.length,
    allColumns: ws.headers.length,
    notShared: ws.rows.filter((r, i) => !r.removed && !choice.items.has(state.ingested[i])).length,
    hidden: workState.hiddenHeaders.length,
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
      ...(labels && groups ? { labels, programGroups: groups } : {}),
      ...(presentationView && presentationView.stageSize().width > 0 ? { stage: presentationView.stageSize() } : {}),
    },
    summary,
  };
}

// The exported page: the application's own single-file page with the data
// island embedded (one pipeline, FR-11).
export function cloneSeries(series: SeriesAssignments): SeriesAssignments {
  return Object.fromEntries(SERIES_ROLES.filter((r) => series[r]).map((r) => [r, { ...series[r]!, columns: { ...series[r]!.columns } }]));
}

// The series as they travel in an exported file: only their kept columns;
// a series with none left does not travel (FR-53, FR-63).
export function keptSeries(series: SeriesAssignments, keep: (key: string) => boolean): SeriesAssignments {
  const out: SeriesAssignments = {};
  for (const role of SERIES_ROLES) {
    const a = series[role];
    if (!a) {
      continue;
    }
    const columns = Object.fromEntries(Object.entries(a.columns).filter(([, key]) => keep(key)));
    const total = a.total !== null && keep(a.total) ? a.total : null;
    if (Object.keys(columns).length > 0 || total !== null) {
      out[role] = { name: a.name, columns, total } satisfies SeriesAssignment;
    }
  }
  return out;
}

let exportMessage: 'done' | 'cancelled' | 'failed' | 'unavailable' | null = null;
// The page prepared when the dialog opened, so that the size stated is the
// size of the file that is written.
let preparedExport: string | null = null;

export function formatSize(bytes: number): string {
  const locale = state.prefs.lang === 'sv' ? 'sv-SE' : 'en-GB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(mb)} MB`;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.max(1, Math.round(bytes / 1024)))} kB`;
}

export function openExportDialog(): void {
  if (state.viewOnly) {
    return;
  }
  exportChoice = defaultExportChoice();
  preparedExport = exportPage();
  if (preparedExport === null) {
    exportMessage = 'unavailable';
    renderExport();
    return;
  }
  exportMessage = null;
  showDialog('export-panel');
  buildExportSelection();
  renderExport();
  el('export-go').focus();
}

export function closeExportDialog(): void {
  preparedExport = null;
  exportChoice = null;
  hideDialog('export-panel');
  el('export-open').focus();
}

// The selection controls (FR-53): the items grouped by area, each area with
// a control for the whole group, and the columns. Built when the dialog
// opens; a change updates the controls in place and prepares the file again.
function exportGroups(): Array<{ area: string; rows: RowData[] }> {
  const areaKey = state.roles.area;
  const groups = new Map<string, RowData[]>();
  for (const { row } of numbered()) {
    const area = areaKey === undefined ? '' : (row.values[areaKey] ?? '').trim();
    groups.set(area, [...(groups.get(area) ?? []), row]);
  }
  const ordered = [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : 0));
  return ordered.map((area) => ({ area, rows: groups.get(area)! }));
}

function buildExportSelection(): void {
  const t = strings(state.prefs.lang);
  const choice = exportChoice;
  if (!choice) {
    return;
  }
  el('export-select-heading').textContent = t.exportSelectHeading;
  el('export-select-hint').textContent = t.exportSelectHint;
  el('export-columns-heading').textContent = t.exportColumnsHeading;
  el('export-columns-hint').textContent = t.exportColumnsHint;
  const byArea = state.roles.area !== undefined;
  const lists = exportGroups().map(({ area, rows }) => {
    const group = document.createElement('li');
    group.className = 'export-area';
    if (byArea) {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'export-area-toggle';
      box.dataset.area = area;
      box.addEventListener('change', () => {
        for (const row of rows) {
          if (box.checked) {
            choice.items.add(row);
          } else {
            choice.items.delete(row);
          }
        }
        exportChoiceChanged();
      });
      label.append(box, document.createTextNode(area === '' ? t.exportNoArea : area));
      group.appendChild(label);
    }
    const list = document.createElement('ul');
    list.className = 'export-items';
    for (const row of rows) {
      const li = document.createElement('li');
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'export-item-toggle';
      box.dataset.rowId = rowId(row);
      box.addEventListener('change', () => {
        if (box.checked) {
          choice.items.add(row);
        } else {
          choice.items.delete(row);
        }
        exportChoiceChanged();
      });
      const number = numberLabel(row);
      label.append(box, document.createTextNode(`${number}. ${itemLabel(row, number)}`));
      li.appendChild(label);
      list.appendChild(li);
    }
    group.appendChild(list);
    return group;
  });
  el('export-selection').replaceChildren(...lists);
  el('export-columns').replaceChildren(
    ...listColumnOrder(state.headers, state.roles).map((key) => {
      const li = document.createElement('li');
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'export-column-toggle';
      box.dataset.header = key;
      box.addEventListener('change', () => {
        if (box.checked) {
          choice.columns.add(key);
        } else {
          choice.columns.delete(key);
        }
        exportChoiceChanged();
      });
      label.append(box, document.createTextNode(labelOf(key)));
      li.appendChild(label);
      return li;
    }),
  );
  syncExportSelection();
}

function syncExportSelection(): void {
  const choice = exportChoice;
  if (!choice) {
    return;
  }
  for (const box of document.querySelectorAll<HTMLInputElement>('.export-item-toggle')) {
    const row = rowById(box.dataset.rowId ?? '');
    box.checked = row !== undefined && choice.items.has(row);
  }
  for (const { area, rows } of exportGroups()) {
    const box = [...document.querySelectorAll<HTMLInputElement>('.export-area-toggle')].find((b) => b.dataset.area === area);
    if (!box) {
      continue;
    }
    const chosen = rows.filter((r) => choice.items.has(r)).length;
    box.checked = chosen === rows.length;
    box.indeterminate = chosen > 0 && chosen < rows.length;
  }
  for (const box of document.querySelectorAll<HTMLInputElement>('.export-column-toggle')) {
    box.checked = choice.columns.has(box.dataset.header ?? '');
  }
}

function exportChoiceChanged(): void {
  syncExportSelection();
  preparedExport = exportPage();
  renderExport();
}

export function renderExport(): void {
  const t = strings(state.prefs.lang);
  const status = el('export-status');
  const messages = { done: t.exportDone, cancelled: t.exportCancelled, failed: t.exportFailed, unavailable: t.exportUnavailable };
  status.textContent = exportMessage ? messages[exportMessage] : '';
  status.classList.toggle('error', exportMessage === 'failed' || exportMessage === 'unavailable');
  if (el('export-panel').classList.contains('hidden') || preparedExport === null) {
    return;
  }
  const s = captureExport().summary;
  const item = (text: string) => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  };
  const items =
    s.columns === s.allColumns
      ? fill(t.exportItems, { items: s.items, columns: s.columns })
      : fill(t.exportItemsSome, { items: s.items, columns: s.columns, all: s.allColumns });
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
    item(fill(t.exportNotShared, { count: s.notShared })),
    item(fill(t.exportColumnsLeftOut, { count: s.allColumns - s.columns })),
    item(fill(t.exportEditedOriginals, { edited: s.edited })),
    item(t.exportPresets),
  );
  el('export-size').textContent = fill(t.exportSize, { size: formatSize(new Blob([preparedExport]).size) });
}

export async function runExport(): Promise<void> {
  const page = preparedExport;
  if (page === null) {
    return;
  }
  const { outcome } = await writeFile(page, EXPORT_FILE);
  exportMessage = outcome === 'saved' ? 'done' : outcome;
  closeExportDialog();
  renderExport();
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
export function setComparison(value: OpenComparison | null): void {
  comparison = value;
}

export function isHtmlFile(file: File, text: string): boolean {
  return /\.html?$/i.test(file.name) || file.type === 'text/html' || /^\s*</.test(text);
}

export function openExportForComparison(text: string): boolean {
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
  comparison = { data, selected: new Set(), message: null };
  setWorkMessage('compare-opened');
  renderWorkStatus();
  renderComparison();
  el('compare-heading').scrollIntoView?.({ block: 'nearest' });
  return true;
}

export function closeComparison(): void {
  comparison = null;
  renderComparison();
}

// The items of both sides, for pairing.
function comparisonSides(data: ExportData): { current: CompareItem[]; file: CompareItem[] } | null {
  const currentKey = state.roles.identifier;
  const fileKey = data.workState.roles.identifier;
  if (currentKey === undefined || fileKey === undefined) {
    return null;
  }
  const current = numbered().map(({ row, label: number }) => ({
    key: rowId(row),
    identifier: row.values[currentKey] ?? '',
    number,
    label: itemLabel(row, number),
    position: state.positions.get(row) ?? null,
  }));
  const placed = new Map(data.workState.markers.map((m) => [m.row, m.position]));
  const t = strings(state.prefs.lang);
  // The file's numbers follow the current numbering mode (FR-14 as
  // amended): its grouped numbers in the grouped mode, where the file
  // carries them, and its global numbers otherwise.
  const fileNumber = (i: number) => (groupedNumbering() && data.labels ? data.labels[i] : String(data.numbers[i]));
  const file = data.workState.rows.map((row, i) => ({
    key: String(i),
    identifier: row.values[fileKey] ?? '',
    number: fileNumber(i),
    label: displayName(row.values, data.workState.roles, `${t.numberColumn} ${fileNumber(i)}`),
    position: placed.get(i) ?? null,
  }));
  return { current, file };
}

function fileColumnLabel(data: ExportData, key: string | undefined): string {
  if (key === undefined) {
    return '';
  }
  const manual = data.workState.manualColumns.find((c) => c.key === key);
  return manual ? manual.label : columnLabel(key, strings(state.prefs.lang).untitledHeader);
}

function currentComparison(): Comparison | null {
  if (!comparison) {
    return null;
  }
  const sides = comparisonSides(comparison.data);
  return sides ? compareItems(sides.current, sides.file) : null;
}

export function renderComparison(): void {
  if (!comparison) {
    hideDialog('compare-panel');
    return;
  }
  const t = strings(state.prefs.lang);
  const data = comparison.data;
  showDialog('compare-panel');
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
  if (state.roles.identifier === undefined) {
    warningText = t.compareNoIdentifierCurrent;
  } else if (data.workState.roles.identifier === undefined) {
    warningText = t.compareNoIdentifierFile;
  } else if (!mapView?.background) {
    warningText = t.compareNoBackground;
  } else if (
    data.workState.background &&
    (data.workState.background.width !== mapView.background.width || data.workState.background.height !== mapView.background.height)
  ) {
    warningText = fill(t.compareBackgroundDiffers, {
      fileWidth: data.workState.background.width,
      fileHeight: data.workState.background.height,
      width: mapView.background.width,
      height: mapView.background.height,
    });
  }
  warning.textContent = warningText;
  warning.classList.toggle('hidden', warningText === '');
  const canAdopt = result !== null && mapView?.background !== null && mapView?.background !== undefined;
  // Drop choices that are no longer adoptable.
  const adoptable = new Set((result?.matchedWithMarkers ?? []).map((m) => m.current.key));
  for (const key of [...comparison.selected]) {
    if (!adoptable.has(key)) {
      comparison.selected.delete(key);
    }
  }
  if (result) {
    // An entry of the file alone shows the file's number, named as such, so
    // that it is not taken for a current number.
    const entry = (item: CompareItem, notes: string[] = [], side: 'current' | 'file' = 'current') => {
      const li = document.createElement('li');
      li.className = 'compare-entry';
      li.dataset.key = item.key;
      li.dataset.side = side;
      const name = document.createElement('span');
      name.className = 'compare-name';
      name.textContent = side === 'file' ? fill(t.compareFileEntry, { number: item.number, label: item.label }) : `${item.number}. ${item.label}`;
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
            if (box.checked) {
              comparison!.selected.add(m.current.key);
            } else {
              comparison!.selected.delete(m.current.key);
            }
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
    group(
      'file-only',
      t.compareFileOnly,
      result.fileOnly.map((item) => entry(item, [], 'file')),
    );
    group(
      'current-only',
      t.compareCurrentOnly,
      result.currentOnly.map((item) => entry(item)),
    );
    group('unpairable', t.compareUnpairable, [
      ...result.unpairable.current.map((item) => entry(item, [t.compareInCurrent])),
      ...result.unpairable.file.map((item) => entry(item, [t.compareInFile], 'file')),
    ]);
  }
  const differing = (result?.matchedWithMarkers ?? []).filter((m) => m.positionDiffers);
  el<HTMLButtonElement>('compare-select-all').disabled = !canAdopt || differing.length === 0;
  el<HTMLButtonElement>('compare-adopt').disabled = !canAdopt || comparison.selected.size === 0;
  el('compare-status').textContent = comparison.message ? fill(t.compareAdopted, { count: comparison.message.count }) : '';
}

export function selectAllDiffering(): void {
  const result = currentComparison();
  if (!comparison || !result) {
    return;
  }
  for (const m of result.matchedWithMarkers) {
    if (m.positionDiffers) {
      comparison.selected.add(m.current.key);
    }
  }
  comparison.message = null;
  renderComparison();
}

// The explicit adoption: the chosen paired items take the marker positions
// of the file. It is an unsaved change, like any placement.
export function adoptPositions(): void {
  const result = currentComparison();
  if (!comparison || !result || !mapView?.background) {
    return;
  }
  let count = 0;
  for (const m of result.matchedWithMarkers) {
    if (!comparison.selected.has(m.current.key) || !m.file.position) {
      continue;
    }
    const row = rowById(m.current.key);
    if (!row) {
      continue;
    }
    placeMarker(state.positions, row, { ...m.file.position });
    count += 1;
  }
  comparison.selected.clear();
  comparison.message = { count };
  if (count > 0) {
    markDirty();
  }
  renderMapItems();
  renderComparison();
}
