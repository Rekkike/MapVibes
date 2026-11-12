// The activities dialog: the import of activities and their hand
// corrections.
import type { RowData } from './dataset';
import { strings, type Strings } from './i18n';
import { type ActivityImport, activityId, type StoredActivity } from './workstate';
import { parsePdfPages, parseRows, type ActivityDraft, type ActivityField, type ActivityTable } from './activityparse';
import { readPdfText } from './pdftext';
import { readDate } from './dates';
import { el, fill, rowById, state } from './appstate';
import { markDirty } from './workfile';
import { renderMapItems } from './mapstage';
import { hideDialog, showDialog } from './narrowlayout';

// The activities import dialog (FR-76): choose a PDF, the table is
// recognised generically, the columns are proposed and assigned by the user,
// and the parsed rows are reviewed (each droppable) before anything attaches
// (hard constraint 6). The origin system's header words are displayed as the
// user's own words and never matched (hard constraint 5).
// The work phase of an item (FR-78): the id of one of its activities, or
// undefined for none; a reference to an activity that is gone is no phase.
export function workPhaseOf(row: RowData): string | undefined {
  const id = state.workPhases.get(row);
  return id !== undefined && (state.activities.get(row) ?? []).some((a) => a.id === id) ? id : undefined;
}

// An activity as it is being corrected (FR-76): its texts as typed, the
// progress as text (empty for none), and whether it is to be removed.
interface ActivityEdit {
  id: string;
  label: string;
  start: string;
  end: string;
  progress: string;
  removed: boolean;
}

export let activityDialog: {
  // The import, or the correction of what an import gave (FR-76).
  mode: 'import' | 'edit';
  edits: ActivityEdit[];
  // The work phase chosen in the edit mode (FR-78): an activity id, or ''.
  phase: string;
  rowId: string;
  file: string;
  tables: ActivityTable[];
  tableIndex: number;
  grid: string[][];
  mapping: Partial<Record<ActivityField, number>>;
  drafts: ActivityDraft[];
} | null = null;

const ACTIVITY_FIELDS: ActivityField[] = ['label', 'start', 'end', 'progress', 'duration'];

function activityRoleLabel(t: Strings, field: ActivityField): string {
  return {
    label: t.activityRoleLabel,
    start: t.activityRoleStart,
    end: t.activityRoleEnd,
    progress: t.activityRoleProgress,
    duration: t.activityRoleDuration,
  }[field];
}

export function openActivityDialog(id: string): void {
  if (state.viewOnly) {
    return;
  }
  activityDialog = { mode: 'import', edits: [], phase: '', rowId: id, file: '', tables: [], tableIndex: 0, grid: [], mapping: {}, drafts: [] };
  el('activity-status').textContent = '';
  renderActivityDialog();
  showDialog('activity-panel');
  el('activity-choose').focus();
}

// The edit mode (FR-76 as amended): the activities an import gave, each to
// be repaired or removed. Nothing here creates an activity.
export function openActivityCorrection(id: string): void {
  if (state.viewOnly) {
    return;
  }
  const row = rowById(id);
  const activities = row ? (state.activities.get(row) ?? []) : [];
  if (!row || activities.length === 0) {
    return;
  }
  activityDialog = {
    mode: 'edit',
    edits: activities.map((a) => ({
      id: a.id,
      label: a.label,
      start: a.start,
      end: a.end,
      progress: a.progress === null ? '' : String(a.progress),
      removed: false,
    })),
    phase: workPhaseOf(row) ?? '',
    rowId: id,
    file: '',
    tables: [],
    tableIndex: 0,
    grid: [],
    mapping: {},
    drafts: [],
  };
  el('activity-status').textContent = '';
  renderActivityDialog();
  showDialog('activity-panel');
  (el('activity-rows').querySelector<HTMLElement>('input') ?? el('activity-close')).focus();
}

// A progress as typed in the edit mode: a number from 0 to 100, null for
// none, or undefined when it is neither.
function readProgress(text: string): number | null | undefined {
  const s = text.trim();
  if (s === '') {
    return null;
  }
  if (!/^\d+([.,]\d+)?$/.test(s)) {
    return undefined;
  }
  const n = Number(s.replace(',', '.'));
  return n >= 0 && n <= 100 ? n : undefined;
}

function renderActivityCorrection(): void {
  const t = strings(state.prefs.lang);
  const d = activityDialog!;
  const row = rowById(d.rowId);
  const before = new Map((row ? (state.activities.get(row) ?? []) : []).map((a) => [a.id, a]));
  el('activity-heading').textContent = t.activityCorrectHeading;
  el('activity-intro').textContent = t.activityCorrectIntro;
  el('activity-go').textContent = t.activityCorrectGo;
  el('activity-review-heading').textContent = t.activityCorrectListHeading;
  el('activity-review-hint').textContent = t.activityCorrectHint;
  el('activity-choose-row').classList.add('hidden');
  el('activity-propose').classList.remove('hidden');
  el('activity-propose-heading').classList.add('hidden');
  el('activity-roles').classList.add('hidden');
  el('activity-replace-notice').classList.add('hidden');
  // The work phase (FR-78 as amended): one of the item's activities, or none.
  el('activity-phase-row').classList.remove('hidden');
  el('activity-phase-label').textContent = t.activityPhase;
  el('activity-phase-hint').textContent = t.activityPhaseHint;
  const phase = el<HTMLSelectElement>('activity-phase');
  const none = document.createElement('option');
  none.value = '';
  none.textContent = t.activityPhaseNone;
  phase.replaceChildren(
    none,
    ...d.edits
      .filter((e) => !e.removed)
      .map((e) => {
        const option = document.createElement('option');
        option.value = e.id;
        option.textContent = e.label.trim() === '' ? `${e.start} \u2013 ${e.end}` : e.label.trim();
        return option;
      }),
  );
  phase.value = d.phase;
  const rows = el('activity-rows');
  rows.replaceChildren(
    ...d.edits.map((edit) => {
      const original = before.get(edit.id);
      const li = document.createElement('li');
      li.className = 'vocab-item activity-row activity-edit';
      li.dataset.activityId = edit.id;
      li.dataset.dropped = String(edit.removed);
      const name = original?.label || edit.id;
      const note = document.createElement('span');
      note.className = 'activity-edit-note notice';
      // What the row is: edited by hand (before or now), and a date that
      // cannot be read, kept as typed.
      const describe = () => {
        const changed =
          !!original &&
          (edit.label.trim() !== original.label ||
            edit.start.trim() !== original.start ||
            edit.end.trim() !== original.end ||
            readProgress(edit.progress) !== original.progress);
        const notes: string[] = [];
        if (original?.edited || changed) {
          notes.push(t.activityEdited);
        }
        for (const [value, label] of [
          [edit.start, t.activityRoleStart],
          [edit.end, t.activityRoleEnd],
        ] as const) {
          if (value.trim() !== '' && readDate(value).kind !== 'date') {
            notes.push(`${label}: ${value.trim()} (${t.activityAsTyped})`);
          }
        }
        if (readProgress(edit.progress) === undefined) {
          notes.push(t.activityProgressInvalid);
        }
        note.textContent = notes.join(' \u00b7 ');
        li.dataset.edited = String(!!original?.edited || changed);
      };
      const input = (field: 'label' | 'start' | 'end' | 'progress', label: string) => {
        const node = document.createElement('input');
        node.type = 'text';
        node.className = `activity-edit-${field}`;
        node.value = edit[field];
        node.disabled = edit.removed;
        node.setAttribute('aria-label', `${label}: ${name}`);
        node.placeholder = label;
        if (field === 'progress') {
          node.inputMode = 'decimal';
        }
        node.addEventListener('input', () => {
          edit[field] = node.value;
          describe();
        });
        return node;
      };
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'vocab-remove activity-edit-remove';
      remove.textContent = edit.removed ? t.activityRestore : t.vocabRemove;
      remove.setAttribute('aria-label', `${edit.removed ? t.activityRestore : t.vocabRemove}: ${name}`);
      remove.setAttribute('aria-pressed', String(edit.removed));
      remove.addEventListener('click', () => {
        edit.removed = !edit.removed;
        // A removed activity cannot be the work phase.
        if (edit.removed && d.phase === edit.id) {
          d.phase = '';
        }
        renderActivityDialog();
      });
      li.append(
        input('label', t.activityRoleLabel),
        input('start', t.activityRoleStart),
        input('end', t.activityRoleEnd),
        input('progress', t.activityRoleProgress),
        remove,
        note,
      );
      describe();
      return li;
    }),
  );
  el<HTMLButtonElement>('activity-go').disabled = false;
}

function confirmActivityCorrection(): void {
  const d = activityDialog;
  if (!d) {
    return;
  }
  const t = strings(state.prefs.lang);
  const row = rowById(d.rowId);
  if (!row) {
    return;
  }
  const kept = d.edits.filter((e) => !e.removed);
  if (kept.some((e) => readProgress(e.progress) === undefined)) {
    el('activity-status').textContent = t.activityProgressRefused;
    return;
  }
  const before = new Map((state.activities.get(row) ?? []).map((a) => [a.id, a]));
  let changed = 0;
  const next: StoredActivity[] = kept.map((e) => {
    const original = before.get(e.id)!;
    const fixed = { label: e.label.trim(), start: e.start.trim(), end: e.end.trim(), progress: readProgress(e.progress) as number | null };
    const differs = fixed.label !== original.label || fixed.start !== original.start || fixed.end !== original.end || fixed.progress !== original.progress;
    if (differs) {
      changed++;
    }
    // Every correction marks the activity as edited by hand.
    return { id: original.id, ...(original.edited || differs ? { edited: true as const } : {}), ...fixed };
  });
  const removed = d.edits.length - kept.length;
  if (next.length > 0) {
    state.activities.set(row, next);
  } else {
    state.activities.delete(row);
  }
  const phaseBefore = workPhaseOf(row) ?? '';
  const phase = next.some((a) => a.id === d.phase) ? d.phase : '';
  if (phase === '') {
    state.workPhases.delete(row);
  } else {
    state.workPhases.set(row, phase);
  }
  if (changed > 0 || removed > 0 || phase !== phaseBefore) {
    markDirty();
  }
  renderMapItems();
  closeActivityDialog();
  el('work-status').textContent = fill(t.activityCorrectDone, { changed, removed });
}

export function closeActivityDialog(): void {
  activityDialog = null;
  hideDialog('activity-panel');
  el('activity-status').textContent = '';
}

export function renderActivityDialog(): void {
  const t = strings(state.prefs.lang);
  el('activity-close').textContent = t.close;
  el('activity-cancel').textContent = t.commentCancel;
  if (activityDialog?.mode === 'edit') {
    renderActivityCorrection();
    return;
  }
  el('activity-choose-row').classList.remove('hidden');
  el('activity-phase-row').classList.add('hidden');
  el('activity-propose-heading').classList.remove('hidden');
  el('activity-roles').classList.remove('hidden');
  el('activity-heading').textContent = t.activityHeading;
  el('activity-intro').textContent = t.activityIntro;
  el('activity-choose').textContent = t.activityChoose;
  el('activity-go').textContent = t.activityGo;
  const d = activityDialog;
  const propose = el('activity-propose');
  if (!d || d.tables.length === 0) {
    propose.classList.add('hidden');
    if (d && d.file !== '' && d.tables.length === 0 && el('activity-status').textContent === '') {
      el('activity-status').textContent = t.activityNoTable;
    }
    return;
  }
  propose.classList.remove('hidden');
  const table = d.tables[d.tableIndex];
  el('activity-propose-heading').textContent = t.activityProposeHeading;
  el('activity-review-heading').textContent = t.activityReviewHeading;
  el('activity-review-hint').textContent = t.activityReviewHint;
  // The assign step: one select per role, the options being the PDF's own
  // header words.
  const roles = el('activity-roles');
  roles.replaceChildren(
    ...ACTIVITY_FIELDS.map((field) => {
      const li = document.createElement('li');
      li.className = 'vocab-item';
      const label = document.createElement('label');
      label.className = 'visibility-control';
      const name = document.createElement('span');
      name.textContent = activityRoleLabel(t, field);
      const select = document.createElement('select');
      select.className = 'activity-role';
      select.dataset.field = field;
      select.setAttribute('aria-label', `${activityRoleLabel(t, field)} (${table.columns.map((c) => c.header).join(', ')})`);
      const none = document.createElement('option');
      none.value = '';
      none.textContent = t.activityRoleNone;
      select.appendChild(none);
      for (const col of table.columns) {
        const opt = document.createElement('option');
        opt.value = String(col.index);
        opt.textContent = col.header === '' ? `#${col.index + 1}` : col.header;
        select.appendChild(opt);
      }
      select.value = d.mapping[field] === undefined ? '' : String(d.mapping[field]);
      select.addEventListener('change', () => {
        const v = select.value === '' ? undefined : Number(select.value);
        d.mapping = { ...d.mapping, [field]: v };
        // A re-parse keeps the review's drop decisions, row by row.
        const dropped = d.drafts.map((r) => r.dropped);
        d.drafts = parseRows(d.grid, d.mapping);
        d.drafts.forEach((r, i) => (r.dropped = dropped[i] ?? false));
        renderActivityDialog();
      });
      label.append(name, select);
      li.appendChild(label);
      return li;
    }),
  );
  // A re-import (FR-76 as amended). The same file and page: a hand-corrected
  // activity is matched by its row position and keeps its values and mark.
  // A different file or page replaces the activities, said with its count.
  const target = rowById(d.rowId);
  const existing = target ? (state.activities.get(target) ?? []) : [];
  const last = target ? state.activityImports.get(target) : undefined;
  const same = sameImport(last, d.file, table.page);
  const notice = el('activity-replace-notice');
  const replaces = existing.length > 0 && !same;
  notice.classList.toggle('hidden', !replaces);
  notice.textContent = replaces
    ? fill(last ? t.activityReplaceNotice : t.activityReplaceNoticeUnknown, {
        file: last?.file ?? '',
        page: last?.page ?? '',
        count: existing.length,
        edited: existing.filter((a) => a.edited).length,
      }) + (target && workPhaseOf(target) !== undefined ? ` ${t.activityReplacePhase}` : '')
    : '';
  // The review: each parsed row with its cells, its read results, and a drop.
  const rows = el('activity-rows');
  rows.replaceChildren(
    ...d.drafts.map((draft, i) => {
      const li = document.createElement('li');
      li.className = 'vocab-item activity-row';
      li.dataset.dropped = String(draft.dropped);
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = !draft.dropped;
      check.setAttribute('aria-label', t.activityRowDrop);
      check.addEventListener('change', () => {
        draft.dropped = !check.checked;
        li.dataset.dropped = String(draft.dropped);
      });
      const text = document.createElement('span');
      text.className = 'placement-label';
      const cells = draft.cells.map((c, cIndex) => {
        const col = table.columns[cIndex];
        const role = ACTIVITY_FIELDS.find((f) => d.mapping[f] === cIndex);
        let cell = c === '' ? '\u2013' : c;
        if (role === 'start' && draft.startText !== null) {
          cell = `${c} (${t.activityAsTyped})`;
        }
        if (role === 'end' && draft.endText !== null) {
          cell = `${c} (${t.activityAsTyped})`;
        }
        return col ? `${col.header}: ${cell}` : cell;
      });
      text.textContent = cells.join(' \u00b7 ');
      li.append(check, text);
      // A row whose activity was corrected by hand: shown as edited by hand,
      // with the values that are kept, beside the source's cells.
      const kept = same ? existing.find((a) => a.id === activityId(i) && a.edited) : undefined;
      if (kept) {
        li.dataset.edited = 'true';
        const mark = document.createElement('span');
        mark.className = 'activity-edit-note notice';
        mark.textContent = fill(t.activityKeptEdit, {
          values: [kept.label, `${kept.start} \u2013 ${kept.end}`, ...(kept.progress === null ? [] : [`${kept.progress} %`])].join(' \u00b7 '),
        });
        li.appendChild(mark);
      }
      return li;
    }),
  );
  el<HTMLButtonElement>('activity-go').disabled = d.drafts.every((r) => r.dropped) || d.drafts.length === 0;
}

export async function onActivityFile(file: File): Promise<void> {
  const t = strings(state.prefs.lang);
  const d = activityDialog;
  if (!d) {
    return;
  }
  el('activity-status').textContent = '';
  let data: ArrayBuffer;
  try {
    data = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsArrayBuffer(file);
    });
  } catch {
    el('activity-status').textContent = t.activityReadFailed;
    return;
  }
  let pages;
  try {
    pages = await readPdfText(data);
  } catch {
    el('activity-status').textContent = t.activityReadFailed;
    return;
  }
  const result = parsePdfPages(pages);
  if (result.tables.length === 0) {
    d.file = file.name;
    d.tables = [];
    renderActivityDialog();
    el('activity-status').textContent = t.activityNoTable;
    return;
  }
  const table = result.tables[0];
  d.file = file.name;
  d.tables = result.tables;
  d.tableIndex = 0;
  d.mapping = { ...table.mapping };
  // The raw body grid, kept so a changed assignment re-parses without re-reading.
  d.grid = table.rows.map((r) => r.cells);
  d.drafts = table.rows;
  if (result.tables.length > 1) {
    el('activity-status').textContent = fill(t.activityPages, { count: result.tables.length });
  }
  if (d.drafts.length === 0) {
    el('activity-status').textContent = t.activityEmpty;
  }
  renderActivityDialog();
}

// The import is of the same file and page as the item's last one.
function sameImport(last: ActivityImport | undefined, file: string, page: number): boolean {
  return last !== undefined && last.file === file && last.page === page;
}

export function confirmActivityImport(): void {
  const d = activityDialog;
  if (!d) {
    return;
  }
  if (d.mode === 'edit') {
    confirmActivityCorrection();
    return;
  }
  const t = strings(state.prefs.lang);
  const row = rowById(d.rowId);
  if (!row) {
    return;
  }
  const table = d.tables[d.tableIndex];
  // An imported activity's id is its row position in the source table.
  const kept = d.drafts.map((r, position) => ({ r, position })).filter(({ r }) => !r.dropped);
  const existing = state.activities.get(row) ?? [];
  const same = sameImport(state.activityImports.get(row), d.file, table.page);
  const activities: StoredActivity[] = kept.map(({ r, position }) => {
    // The same file and page again: a hand-corrected activity at this row
    // position keeps its values and its mark (FR-76 as amended).
    const corrected = same ? existing.find((a) => a.id === activityId(position) && a.edited) : undefined;
    if (corrected) {
      return { ...corrected };
    }
    return {
      id: activityId(position),
      label: d.mapping.label === undefined ? '' : (r.cells[d.mapping.label] ?? '').trim(),
      start: d.mapping.start === undefined ? '' : (r.cells[d.mapping.start] ?? '').trim(),
      end: d.mapping.end === undefined ? '' : (r.cells[d.mapping.end] ?? '').trim(),
      progress: d.mapping.progress === undefined ? null : (r.progress ?? null),
    };
  });
  // A different file or page replaces the activities: the ids name other
  // rows now, so the work phase goes with what it referred to. The same
  // file keeps it while its activity is still there.
  if (!same || !activities.some((a) => a.id === state.workPhases.get(row))) {
    state.workPhases.delete(row);
  }
  state.activities.set(row, activities);
  const columns: Record<string, string> = {};
  for (const field of ACTIVITY_FIELDS) {
    if (d.mapping[field] !== undefined) {
      columns[field] = table.columns[d.mapping[field]].header;
    }
  }
  state.activityImports.set(row, { file: d.file, page: table.page, columns });
  markDirty();
  renderMapItems();
  closeActivityDialog();
  el('work-status').textContent = t.activityDone.replace('{count}', String(activities.length));
}
