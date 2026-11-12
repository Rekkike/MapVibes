// The details panel of an item and its comments.
import type { RowData } from './dataset';
import { listColumnOrder } from './roles';
import { strings, type Strings } from './i18n';
import { addComment, commentsOf, editComment, formatCommentDate, removeComment } from './comments';
import { renderDetails, type DetailField, type DetailLabels, type DetailModel } from './details';
import { SERIES_ROLES } from './economics';
import { formatArea, trueArea } from './annotations';
import {
  colourLabel,
  detailValueInput,
  effectiveSeries,
  fitToContent,
  labelOf,
  narrowApplication,
  numberLabel,
  statusCell,
  symbolLabel,
  symbolOf,
} from './main';
import { el, fill, rowById, rowId, state } from './appstate';
import { markDirty } from './workfile';
import { openActivityCorrection, openActivityDialog } from './activitydialog';
import { annotationName, areaLocale, linkedRow } from './annotationpanel';
import { itemLabel, mapView, renderMapItems } from './mapstage';
import { economicsFor, openEconomics, shownCardColumns } from './presentationstage';

// Details panel (FR-7): the complete data of one item, open in the
// Information and Map segments, following the selection and the live data.
let detailsReturnFocus: HTMLElement | null = null;

export function openDetails(id: string | null, focus = false): void {
  const previous = state.detailsId;
  state.detailsId = id;
  if (id !== null && focus) {
    detailsReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  renderDetailsPanel();
  document.querySelectorAll<HTMLElement>('#row-table-body tr[data-row-id]').forEach((tr) => {
    if (tr.dataset.rowId === state.detailsId) {
      tr.dataset.details = 'true';
    } else {
      delete tr.dataset.details;
    }
  });
  if (id !== null && focus) {
    document.querySelector<HTMLElement>('#details-panel .details-close')?.focus();
  }
  if (id === null && previous !== null) {
    const target = detailsReturnFocus;
    detailsReturnFocus = null;
    if (target?.isConnected) {
      target.focus();
    }
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
    editComment: t.commentEditLabel,
    edit: t.commentEdit,
    save: t.commentSave,
    cancel: t.commentCancel,
    footprints: t.detailsFootprints,
    importActivities: state.viewOnly ? null : t.activityImport,
    correctActivities: state.viewOnly ? null : t.activityCorrect,
  };
}

// Every column, hidden ones included, in the list's column order.
export function detailModel(row: RowData, t: Strings): DetailModel {
  const number = numberLabel(row);
  const symbol = symbolOf(row);
  const fields: DetailField[] = listColumnOrder(state.headers, state.roles).map((key) => ({
    key,
    label: labelOf(key),
    value: row.values[key] ?? '',
    kind: key === state.roles.status ? 'status' : key === state.roles.area ? 'area' : 'text',
  }));
  const name = itemLabel(row, number);
  return {
    rowId: rowId(row),
    number,
    name,
    colour: row.colour,
    colourName: colourLabel(row.colour),
    symbol,
    symbolName: symbolLabel(symbol),
    fields,
    comments: commentsOf(state.comments, row).map((c) => ({
      id: c.id,
      date: c.date,
      dateText: formatCommentDate(c.date),
      text: c.text,
      ...(c.edited ? { edited: c.edited, editedText: fill(t.commentEdited, { date: formatCommentDate(c.edited) }) } : {}),
    })),
    note: state.roles.note === undefined ? '' : (row.values[state.roles.note] ?? ''),
    cardFields:
      state.cardColumns === null
        ? CARD_ROLES.map((role) => state.roles[role])
            .filter((key): key is string => key !== undefined)
            .map((key) => ({ key, label: labelOf(key), value: (row.values[key] ?? '').trim() }))
            // Nothing repeats the header: a field holding the name shown
            // there (for example the identifier, when no name is given) is
            // left out.
            .filter((field) => field.value !== '' && field.value !== name)
        : // The work's card fields (FR-62), each shown, a field without a
          // value saying so.
          shownCardColumns().map((key) => ({ key, label: labelOf(key), value: (row.values[key] ?? '').trim() })),
    footprints: state.annotations
      .filter((a) => linkedRow(a) === row)
      .map((a) => {
        const squareMetres = trueArea(a, mapView?.background?.projection);
        return { id: a.id, name: annotationName(a, t), area: squareMetres === null ? null : formatArea(squareMetres, areaLocale()) };
      }),
    seriesGroups: seriesGroups(),
    economics: economicsFor(row) !== null ? t.economicsAction : null,
  };
}

// The assigned year series as groups of the details panel (FR-7 as
// amended): one line each, its years in order, its total column last.
const openSeriesGroups = new Set<string>();

function seriesGroups(): DetailModel['seriesGroups'] {
  const series = effectiveSeries();
  return SERIES_ROLES.filter((r) => series[r]).map((role) => {
    const a = series[role]!;
    const years = Object.keys(a.columns)
      .map(Number)
      .sort((x, y) => x - y);
    const keys = years.map((y) => a.columns[y]);
    if (a.total !== null) {
      keys.push(a.total);
    }
    const span = years.length === 0 ? '' : years.length === 1 ? ` · ${years[0]}` : ` · ${years[0]}–${years[years.length - 1]}`;
    return { role, label: `${a.name}${span}`, keys, open: openSeriesGroups.has(role) };
  });
}

// The structured fields of the presentation card (FR-37), in this order.
export const CARD_ROLES = ['identifier', 'area', 'status', 'program', 'start', 'end'] as const;

export function renderDetailsPanel(): void {
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
    narrowApplication(),
    model.fields.map((f) => [f.key, f.kind]),
    model.comments.map((c) => c.id),
    state.statuses,
    model.footprints,
    model.seriesGroups.map((g) => [g.role, g.label, g.keys]),
    model.economics,
    // The correction is offered only while the item has activities.
    (state.activities.get(row)?.length ?? 0) > 0,
  ]);
  const target = sameRow && panel.dataset.structure === structure ? document.createElement('div') : panel;
  if (target !== panel) {
    target.id = panel.id;
  }
  renderDetails(target, model, detailLabels(t), {
    close: () => openDetails(null),
    toggleSeries: (role, open) => {
      if (open) {
        openSeriesGroups.add(role);
      } else {
        openSeriesGroups.delete(role);
      }
    },
    openEconomics: (opener) => openEconomics(rowId(row), opener),
    importActivities: state.viewOnly ? undefined : () => openActivityDialog(rowId(row)),
    correctActivities: state.viewOnly || !state.activities.get(row)?.length ? undefined : () => openActivityCorrection(rowId(row)),
    edit: {
      renderField: (field) => (field.kind === 'status' ? statusCell(row, field.key, model.number) : detailValueInput(row, field.key, model.number)),
      removeComment: (id) => {
        if (!removeComment(state.comments, row, id)) {
          return;
        }
        markDirty();
        renderDetailsPanel();
        panel.querySelector<HTMLElement>('.details-comment-input')?.focus();
      },
      editComment: (id, text) => {
        if (editComment(state.comments, row, id, text)) {
          markDirty();
        }
        renderDetailsPanel();
        panel.querySelector<HTMLElement>(`.details-comment[data-comment-id="${id}"] .details-comment-edit`)?.focus();
      },
      commentForm: () => commentForm(row, t, draft),
    },
  });
  if (target !== panel) {
    patchDetails(panel, target);
  }
  panel.dataset.structure = structure;
  panel.classList.toggle('hidden', state.segment === 'presentation');
  setDetailsLayout(true);
  // Sized once shown, as a hidden field has no height.
  for (const area of panel.querySelectorAll<HTMLTextAreaElement>('textarea.cell-input')) {
    fitToContent(area);
  }
}

// Brings an open panel up to date from a fresh rendering of the same item
// with the same controls: the texts are replaced, and every control takes
// the fresh value and marks, the focused one keeping its node (and so its
// focus, selection, and place in the tab order).
function patchDetails(panel: HTMLElement, fresh: HTMLElement): void {
  const swap = (selector: string) => {
    const now = panel.querySelector(selector);
    const next = fresh.querySelector(selector);
    if (now && next) {
      now.replaceWith(next);
    }
  };
  swap('.details-badge');
  swap('.details-title');
  swap('.details-facts');
  swap('.details-comment-list');
  const nextValues = [...fresh.querySelectorAll<HTMLElement>('.details-fields dd')];
  panel.querySelectorAll<HTMLElement>('.details-fields dd').forEach((dd, i) => {
    const next = nextValues[i];
    if (!next) {
      return;
    }
    const control = dd.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('.cell-input');
    const replacement = next.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('.cell-input');
    if (control && replacement && control === document.activeElement) {
      control.className = replacement.className;
      control.title = replacement.title;
      if (replacement.dataset.edited) {
        control.dataset.edited = replacement.dataset.edited;
      } else {
        delete control.dataset.edited;
      }
      if (control.value !== replacement.value) {
        control.value = replacement.value;
      }
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
    if (!addComment(state.comments, row, input.value)) {
      return;
    }
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
  if (document.documentElement.dataset.details === value) {
    return;
  }
  const before = state.segment === 'map' ? mapView?.stageSize() : undefined;
  document.documentElement.dataset.details = value;
  // The Map stage changes size: its view is refitted, so that the map stays
  // in view (FR-16 as amended); the at-a-glance panels follow.
  if (before) {
    mapView?.refit(before);
  }
  if (state.segment !== 'information') {
    renderMapItems();
  }
}
