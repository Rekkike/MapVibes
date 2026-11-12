// The Presentation segment: the stage, the at-a-glance panel, the data
// card, the legends, the economics overlay, and the schedule views.
import type { RowData } from './dataset';
import { normalise } from './vocab';
import { listColumnOrder } from './roles';
import { format, strings } from './i18n';
import { MapView } from './mapview';
import { MarkerLayer } from './markerlayer';
import { renderLegend, type LegendUse, type SeriesLegend } from './legend';
import { renderCard as renderCardContent } from './details';
import { drawSymbol, symbolClasses } from './symbols';
import { markersInView } from './glance';
import { DEFAULT_SHAPE, placedMarkers, type PlacedMarker } from './markers';
import { BUTTON_ZOOM_FACTOR, imageToScreen, type Point, type Viewport } from './viewport';
import type { PresentationMode, PresentationOrder, TimelineWindow } from './workstate';
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
import { formatAmount, renderEconomics } from './economicsview';
import { formatDate, readDate } from './dates';
import { todayDay } from './clock';
import { readAmount, economicsOf, informationTotals, SERIES_ROLES, yearOfValue, type Economics, type SeriesAssignments, type SeriesRole } from './economics';
import { AnnotationLayer } from './annotationlayer';
import {
  closeNarrowOverlay,
  colourLabels,
  effectiveSeries,
  effectiveSymbols,
  narrowViewer,
  shownProgramGroups,
  symbolLabels,
  symbolOf,
  symbolSource,
} from './main';
import { el, fill, rowById, rowId, state } from './appstate';
import { markDirty } from './workfile';
import { closeDocumentDialog, openDocumentDialog, runDocumentExport } from './documentdialog';
import { closeExportDialog, openExportDialog, runExport } from './exportdialog';
import { activityDialog, closeActivityDialog, confirmActivityImport, onActivityFile, workPhaseOf } from './activitydialog';
import { CARD_ROLES, detailModel } from './detailspanel';
import { areaLocale, renderAnnotationVisibility, renderPresentationAnnotations, setPresentationAnnotations } from './annotationpanel';
import { itemLabel, mapView, markerLabel, renderMapItems } from './mapstage';
import { groupedNumbering, labelOf, numbered, numberLabel, renderList } from './listpanel';

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

export function renderLegends(): void {
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

// Presentation stage (FR-27): the same background on its own viewport, with
// the markers of the items that are switched on. Nothing is edited here.
export let presentationView: MapView | null = null;
let presentationLayer: MarkerLayer | null = null;

// In the exported viewer, the view the file carries (FR-38 as amended):
// restored when the viewer's stage first shows the background, with the
// exported stage's centre at the viewer stage's centre.
let viewerView: { viewport: Viewport; stage?: { width: number; height: number } } | null = null;
export function setViewerView(value: { viewport: Viewport; stage?: { width: number; height: number } } | null): void {
  viewerView = value;
}

export function syncPresentationBackground(): void {
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

export function setHover(id: string | null): void {
  hoverId = id;
  applyHighlight();
}

export function applyHighlight(): void {
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

export function renderCardFieldPicker(): void {
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

export function renderGlanceColumnPicker(): void {
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

export function renderGlance(prefix: 'map' | 'presentation', view: MapView | null, selectedId: string | null, onSelect: (id: string) => void): void {
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

export function closeEconomics(): void {
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
export function renderInformationTotals(): void {
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

export function renderEconomicsOverlay(): void {
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
export let cardId: string | null = null;
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

export function closeCard(): void {
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

export function renderPresentation(): void {
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

export function initialisePresentation(): void {
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
  setPresentationAnnotations(
    new AnnotationLayer(
      el('presentation-annotations') as unknown as SVGSVGElement,
      el('presentation-annotation-labels'),
      () => presentationView?.viewport ?? { scale: 1, x: 0, y: 0 },
    ),
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
